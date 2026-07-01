import { useEffect, useState } from 'react';
import type { ClassificationLabel } from '../types/exoplanet';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');

export interface CatalogTarget {
  id: string;
  ticId: string;
  toiId?: number;
  disposition?: string;
  stellarRadiusSolar?: number;
  stellarMassSolar?: number;
  stellarTempKelvin?: number;
  lastClassification?: ClassificationLabel;
  confidence?: number;
  secPrimRatio?: number;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMockList(): CatalogTarget[] {
  const rand = mulberry32(0x4543484f);
  const dispositions = ['CP', 'KP', 'PC', 'PC', 'PC', 'FP', 'FP'];

  return Array.from({ length: 20 }, () => {
    const ticNum = 100000000 + Math.floor(rand() * 899999999);
    const disposition = dispositions[Math.floor(rand() * dispositions.length)];
    const snr = 2 + rand() * 18;
    const secPrimRatio = rand() * 0.5;

    let label: ClassificationLabel;
    if (snr < 5) label = 'Noise';
    else if (disposition === 'CP' || disposition === 'KP') label = 'Planet';
    else if (disposition === 'FP') label = secPrimRatio > 0.15 ? 'Eclipse' : 'Blend';
    else label = snr > 10 ? 'Planet' : 'Blend';

    return {
      id: `TIC-${ticNum}`,
      ticId: `TIC ${ticNum}`,
      toiId: Math.round((500 + rand() * 6000) * 100) / 100,
      disposition,
      stellarRadiusSolar: Math.round((0.6 + rand() * 2.5) * 100) / 100,
      stellarMassSolar: Math.round((0.5 + rand() * 1.8) * 100) / 100,
      stellarTempKelvin: Math.round(4200 + rand() * 4000),
      lastClassification: label,
      confidence: Math.round(Math.min(0.99, 0.6 + (snr / 40) * 0.35 + rand() * 0.05) * 1000) / 1000,
      secPrimRatio: Math.round(secPrimRatio * 1000) / 1000,
    };
  });
}

export function useTargetList() {
  const [data, setData] = useState<CatalogTarget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);

    if (API_BASE_URL) {
      fetch(`${API_BASE_URL}/api/targets`)
        .then((r) => r.json())
        .then((json) => { setData(json.data ?? []); setIsLoading(false); })
        .catch(() => { setIsError(true); setIsLoading(false); });
      return;
    }

    const id = window.setTimeout(() => {
      setData(generateMockList());
      setIsLoading(false);
    }, 600);
    return () => window.clearTimeout(id);
  }, []);

  return { data, isLoading, isError };
}
