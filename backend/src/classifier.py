import numpy as np
import pandas as pd
import pickle
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

def estimate_planet_radius(st_rad, depth):
    """
    Estimates the planet radius in Earth radii based on stellar radius (in Solar radii)
    and transit depth (in parts-per-thousand / dimensionless relative depth).
    Formula: Rp/R_sun = R_star/R_sun * sqrt(depth)
    R_earth = 109.2 * R_sun
    """
    if np.isnan(st_rad) or np.isnan(depth) or depth <= 0:
        return np.nan
    # TESS depth in catalog is usually in ppm, but let's assume depth is fractional
    # We will convert fractional depth to radius
    r_planet_solar = st_rad * np.sqrt(depth)
    return r_planet_solar * 109.2 # Convert to Earth radii

def compute_theoretical_duration(st_mass, st_rad, period):
    """
    Computes the theoretical transit duration in hours for a circular orbit with impact parameter b=0.
    T_dur = (R_* * P) / (pi * a)
    Using Kepler's Third Law: a^3 = G * M_* * P^2 / (4 * pi^2)
    """
    if np.isnan(st_mass) or np.isnan(st_rad) or np.isnan(period):
        return np.nan
    
    # Constants in SI units
    G = 6.6743e-11
    M_sun = 1.9884e30
    R_sun = 6.957e8
    day_sec = 86400.0
    
    m_star = st_mass * M_sun
    r_star = st_rad * R_sun
    p_sec = period * day_sec
    
    # Semi-major axis in meters
    a = (G * m_star * p_sec**2 / (4.0 * np.pi**2))**(1.0/3.0)
    
    # Duration in seconds
    duration_sec = (r_star * p_sec) / (np.pi * a)
    # Convert to hours
    return duration_sec / 3600.0

def extract_features(lc_data, bls_results):
    """
    Extracts a feature vector for ML classification using BLS outputs, 
    stellar parameters, and light curve stats.
    """
    features = {}
    
    # If no BLS results found, return an empty/nan feature dict
    if bls_results is None:
        return None
        
    # BLS features
    features["bls_period"] = bls_results["period"]
    features["bls_depth"] = bls_results["depth"]
    features["bls_duration"] = bls_results["duration"] * 24.0 # Convert to hours
    features["bls_snr"] = bls_results["snr"]
    features["bls_significance"] = bls_results["significance"]
    
    # Stellar parameters
    features["st_rad"] = lc_data.get("st_rad", 1.0)
    features["st_mass"] = lc_data.get("st_mass", 1.0)
    features["st_teff"] = lc_data.get("st_teff", 5778.0) # Default to Solar values if nan
    
    if np.isnan(features["st_rad"]): features["st_rad"] = 1.0
    if np.isnan(features["st_mass"]): features["st_mass"] = 1.0
    if np.isnan(features["st_teff"]): features["st_teff"] = 5778.0
    
    # Derived physical features
    features["estimated_radius_earth"] = estimate_planet_radius(features["st_rad"], bls_results["depth"])
    
    # Theoretical duration and ratio
    theoretical_dur_h = compute_theoretical_duration(features["st_mass"], features["st_rad"], bls_results["period"])
    features["dur_ratio"] = features["bls_duration"] / theoretical_dur_h if (theoretical_dur_h > 0 and not np.isnan(theoretical_dur_h)) else np.nan
    
    # Eclipsing Binary check (Ratio of secondary eclipse to primary transit)
    # EBs show deep secondary eclipses at phase ~0.5
    prim_d = bls_results.get("primary_depth", 0.0)
    sec_d = bls_results.get("secondary_depth", 0.0)
    features["sec_prim_ratio"] = sec_d / prim_d if prim_d > 0 else 0.0
    
    # Standard deviation of out-of-transit light curve
    # Useful to capture noise level
    y = lc_data["flux"]
    features["flux_std"] = np.nanstd(y)
    features["depth_to_noise"] = bls_results["depth"] / features["flux_std"] if features["flux_std"] > 0 else 0.0
    
    # Fill any NaNs with 0.0 or standard default values
    for k, v in features.items():
        if np.isnan(v) or np.isinf(v):
            features[k] = 0.0
            
    return features

class ExoplanetClassifier:
    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            random_state=42,
            class_weight='balanced'
        )
        self.feature_names = None
        self.is_trained = False
        
    def train(self, X, y):
        """
        Trains the classifier.
        X: Pandas DataFrame of features.
        y: Pandas Series or Array of labels (e.g. 'Planet', 'FalsePositive', 'Noise').
        """
        self.feature_names = list(X.columns)
        
        # Split data for evaluation
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=42, stratify=y
        )
        
        print(f"Training Random Forest classifier on {len(X_train)} samples, testing on {len(X_test)} samples...")
        self.model.fit(X_train, y_train)
        self.is_trained = True
        
        # Evaluate
        y_pred = self.model.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        print(f"Test Accuracy: {acc:.4f}")
        print("\nClassification Report:")
        print(classification_report(y_test, y_pred))
        
        # Display Feature Importances
        importances = self.model.feature_importances_
        indices = np.argsort(importances)[::-1]
        print("Feature Importances:")
        for f in range(X.shape[1]):
            print(f"{f + 1}. {X.columns[indices[f]]}: {importances[indices[f]]:.4f}")
            
        return acc
        
    def predict(self, X):
        """
        Predicts labels for features X.
        """
        if not self.is_trained:
            raise ValueError("Classifier is not trained yet!")
        return self.model.predict(X)
        
    def predict_proba(self, X):
        """
        Predicts label probabilities for features X.
        """
        if not self.is_trained:
            raise ValueError("Classifier is not trained yet!")
        return self.model.predict_proba(X)
        
    def save(self, filepath="data/classifier_model.pkl"):
        """
        Saves the trained model to disk.
        """
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        state = {
            "model": self.model,
            "feature_names": self.feature_names,
            "is_trained": self.is_trained
        }
        with open(filepath, "wb") as f:
            pickle.dump(state, f)
        print(f"Model saved to {filepath}")
        
    def load(self, filepath="data/classifier_model.pkl"):
        """
        Loads a trained model from disk.
        """
        if not os.path.exists(filepath):
            print(f"No saved model found at {filepath}")
            return False
            
        with open(filepath, "rb") as f:
            state = pickle.load(f)
            self.model = state["model"]
            self.feature_names = state["feature_names"]
            self.is_trained = state["is_trained"]
        print(f"Model loaded successfully from {filepath}")
        return True
