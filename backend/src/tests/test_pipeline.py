import unittest
import numpy as np
import pandas as pd
from src.preprocessing import preprocess_lightcurve
from src.dip_detection import run_bls_search, compute_phase_folded_lc
from src.classifier import extract_features, estimate_planet_radius, compute_theoretical_duration
from src.parameter_estimation import trapezoid_transit_model, fit_transit_parameters

class TestExoplanetPipeline(unittest.TestCase):
    
    def setUp(self):
        # Generate simulated clean light curve with a periodic transit
        self.time = np.linspace(0, 10, 1000) # 10 days of observations
        self.flux_err = np.ones_like(self.time) * 0.001
        
        # Base flux
        self.flux = np.ones_like(self.time)
        
        # Periodic transit: Period = 2.5 days, epoch = 1.0, depth = 0.02 (2%), duration = 0.2 days (4.8 hours)
        self.true_period = 2.5
        self.true_epoch = 1.0
        self.true_depth = 0.02
        self.true_duration = 0.2
        
        # Apply transits
        phases = ((self.time - self.true_epoch) / self.true_period) % 1.0
        phases = np.where(phases > 0.5, phases - 1.0, phases)
        transit_mask = np.abs(phases) < (self.true_duration / 2.0)
        self.flux[transit_mask] = 1.0 - self.true_depth
        
        # Add a slow trend (sine wave)
        self.trend = 0.05 * np.sin(2 * np.pi * self.time / 10.0)
        self.flux_with_trend = self.flux + self.trend
        
        # Add minor noise
        np.random.seed(42)
        self.flux_noisy = self.flux_with_trend + np.random.normal(0, 0.001, len(self.time))

    def test_preprocessing(self):
        # Introduce NaNs and a few spikes to test cleaning
        noisy_data = self.flux_noisy.copy()
        noisy_data[10] = np.nan
        noisy_data[50] = 5.0 # extreme outlier
        
        prep = preprocess_lightcurve(self.time, noisy_data, self.flux_err, window_length=51)
        
        self.assertIsNotNone(prep)
        self.assertEqual(len(prep["time"]), len(self.time) - 2) # Both NaN and outlier removed
        self.assertTrue(np.all(~np.isnan(prep["flat_flux"])))
        # Flattened flux should have outliers removed and median centered at ~1.0
        self.assertAlmostEqual(np.nanmedian(prep["flat_flux"]), 1.0, places=3)
        self.assertTrue(np.nanstd(prep["flat_flux"]) < 0.1)

    def test_dip_detection(self):
        # Run BLS on clean flat transit light curve
        bls_res = run_bls_search(self.time, self.flux, self.flux_err, min_period=1.0, max_period=5.0)
        
        self.assertIsNotNone(bls_res)
        # Period should match the injected period of 2.5 days closely
        self.assertAlmostEqual(bls_res["period"], self.true_period, places=1)
        # Depth should match the injected depth of 0.02
        self.assertAlmostEqual(bls_res["depth"], self.true_depth, places=2)
        # SNR should be high
        self.assertTrue(bls_res["snr"] > 10.0)
        
    def test_phase_folding(self):
        folded_phase, folded_flux, folded_err = compute_phase_folded_lc(
            self.time, self.flux, self.flux_err, self.true_period, self.true_epoch
        )
        # Folded phase must be sorted between -0.5 and 0.5
        self.assertEqual(len(folded_phase), len(self.time))
        self.assertTrue(np.all(np.diff(folded_phase) >= 0))
        self.assertTrue(np.min(folded_phase) >= -0.5)
        self.assertTrue(np.max(folded_phase) <= 0.5)

    def test_parameter_estimation(self):
        # Set up a phase-folded light curve directly
        phase = np.linspace(-0.2, 0.2, 500)
        flux_err = np.ones_like(phase) * 0.0005
        
        # Inject transit
        depth = 0.015
        duration = 0.08
        ingress = 0.01
        
        flux = trapezoid_transit_model(phase, 0.0, depth, duration, ingress)
        # Add small gaussian noise
        np.random.seed(123)
        flux_noisy = flux + np.random.normal(0, 0.0001, len(phase))
        
        fit = fit_transit_parameters(phase, flux_noisy, flux_err, bls_period=2.0, bls_depth=depth, bls_duration=duration * 2.0)
        
        self.assertIsNotNone(fit)
        self.assertTrue(fit["success"])
        self.assertAlmostEqual(fit["depth"], depth, places=3)
        self.assertAlmostEqual(fit["duration_hours"], duration * 2.0 * 24.0, places=1)
        self.assertTrue(fit["depth_err"] > 0)

    def test_feature_extraction_and_utils(self):
        # Test physical utility estimates
        rp = estimate_planet_radius(st_rad=1.0, depth=0.01) # 1% depth on Solar-type star
        # Rp/R_sun = 1.0 * sqrt(0.01) = 0.1
        # Rp_earth = 0.1 * 109.2 = 10.92
        self.assertAlmostEqual(rp, 10.92, places=2)
        
        dur = compute_theoretical_duration(st_mass=1.0, st_rad=1.0, period=365.25) # Earth orbit
        # Earth transit duration should be ~13 hours
        self.assertTrue(10.0 < dur < 15.0)
        
        # Test feature dictionary building
        lc_data = {
            "st_rad": 1.2,
            "st_mass": 1.1,
            "st_teff": 6000.0,
            "flux": np.random.normal(1.0, 0.001, 100)
        }
        bls_results = {
            "period": 3.0,
            "epoch": 0.5,
            "depth": 0.005,
            "duration": 0.1,
            "snr": 15.0,
            "significance": 8.0,
            "primary_depth": 0.005,
            "secondary_depth": 0.0002
        }
        
        feats = extract_features(lc_data, bls_results)
        self.assertIsNotNone(feats)
        self.assertEqual(feats["bls_period"], 3.0)
        self.assertEqual(feats["bls_snr"], 15.0)
        self.assertTrue("estimated_radius_earth" in feats)
        self.assertTrue("dur_ratio" in feats)
        self.assertTrue("sec_prim_ratio" in feats)

if __name__ == "__main__":
    unittest.main()
