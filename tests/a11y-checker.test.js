import { describe, it, expect, beforeEach } from 'vitest';
import { A11yChecker } from '../utils/a11y-checker.js';

describe('A11yChecker - color utilities', () => {
  let checker;

  beforeEach(() => {
    checker = new A11yChecker();
  });

  describe('parseColor', () => {
    it('parses rgb() format', () => {
      expect(checker.parseColor('rgb(255, 128, 0)')).toEqual([255, 128, 0, 1]);
    });

    it('parses rgba() format with alpha', () => {
      const result = checker.parseColor('rgba(10, 20, 30, 0.5)');
      expect(result[0]).toBe(10);
      expect(result[1]).toBe(20);
      expect(result[2]).toBe(30);
      expect(result[3]).toBe(0.5);
    });

    it('parses rgba() with alpha=0 (fully transparent)', () => {
      const result = checker.parseColor('rgba(255, 0, 0, 0)');
      expect(result[3]).toBe(0);
    });

    it('parses rgba() without alpha as opaque', () => {
      const result = checker.parseColor('rgba(255, 128, 0)');
      expect(result[3]).toBe(1);
    });

    it('parses hsla() format', () => {
      const result = checker.parseColor('hsla(200, 50%, 50%, 0.3)');
      expect(result[0]).toBeDefined();
      expect(result[1]).toBeDefined();
      expect(result[2]).toBeDefined();
      expect(result[3]).toBe(0.3);
    });

    it('parses hex format (6 digits)', () => {
      expect(checker.parseColor('#ff8000')).toEqual([255, 128, 0, 1]);
    });

    it('parses hex format (3 digits)', () => {
      expect(checker.parseColor('#f80')).toEqual([255, 136, 0, 1]);
    });

    it('parses hex format (4 digits) with alpha', () => {
      const result = checker.parseColor('#f80c');
      expect(result[0]).toBe(255);
      expect(result[1]).toBe(136);
      expect(result[2]).toBe(0);
      expect(result[3]).toBeCloseTo(0.8, 1);
    });

    it('parses hex format (8 digits) with alpha', () => {
      const result = checker.parseColor('#ff800088');
      expect(result[0]).toBe(255);
      expect(result[1]).toBe(128);
      expect(result[2]).toBe(0);
      expect(result[3]).toBeCloseTo(0.533, 2);
    });

    it('returns null for oklch() syntax', () => {
      expect(checker.parseColor('oklch(0.5 0.2 180)')).toBeNull();
    });

    it('returns null for lab() syntax', () => {
      expect(checker.parseColor('lab(50% 20 -30)')).toBeNull();
    });

    it('returns null for color() syntax', () => {
      expect(checker.parseColor('color(srgb 1 0 0)')).toBeNull();
    });

    it('returns null for invalid input', () => {
      expect(checker.parseColor(null)).toBeNull();
      expect(checker.parseColor(undefined)).toBeNull();
    });
  });

  describe('rgbToLuminance', () => {
    it('returns 0 for black', () => {
      expect(checker.rgbToLuminance(0, 0, 0)).toBe(0);
    });

    it('returns 1 for white', () => {
      expect(checker.rgbToLuminance(255, 255, 255)).toBeCloseTo(1, 4);
    });

    it('calculates relative luminance correctly for mid-gray', () => {
      const lum = checker.rgbToLuminance(128, 128, 128);
      expect(lum).toBeGreaterThan(0.2);
      expect(lum).toBeLessThan(0.3);
    });
  });

  describe('calculateContrast', () => {
    it('returns 21:1 for black on white', () => {
      const ratio = checker.calculateContrast('rgb(0, 0, 0)', 'rgb(255, 255, 255)');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('returns 1:1 for same color', () => {
      const ratio = checker.calculateContrast('rgb(128, 128, 128)', 'rgb(128, 128, 128)');
      expect(ratio).toBeCloseTo(1, 2);
    });

    it('composites foreground alpha over background', () => {
      const ratio = checker.calculateContrast('rgba(0, 0, 0, 0.3)', 'rgb(255, 255, 255)');
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(21);
    });

    it('returns null when foreground color has unsupported format', () => {
      expect(checker.calculateContrast('oklch(0.5 0.2 180)', 'rgb(255, 255, 255)')).toBeNull();
    });

    it('returns null when background color has unsupported format', () => {
      expect(checker.calculateContrast('rgb(0, 0, 0)', 'color(srgb 1 1 1)')).toBeNull();
    });

    it('works with hex colors', () => {
      const ratio = checker.calculateContrast('#000', '#fff');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('WCAG AA: 4.5:1 minimum for normal text', () => {
      const ratio = checker.calculateContrast('rgb(89, 89, 89)', 'rgb(255, 255, 255)');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('detects insufficient contrast', () => {
      const ratio = checker.calculateContrast('rgb(200, 200, 200)', 'rgb(255, 255, 255)');
      expect(ratio).toBeLessThan(4.5);
    });
  });
});
