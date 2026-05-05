import { describe, it, expect } from 'vitest';
import { A11yChecker } from '../utils/a11y-checker.js';

describe('A11yChecker - color utilities', () => {
  let checker;

  beforeEach(() => {
    checker = new A11yChecker();
  });

  describe('parseColor', () => {
    it('parses rgb() format', () => {
      expect(checker.parseColor('rgb(255, 128, 0)')).toEqual([255, 128, 0]);
    });

    it('parses rgba() format (uses first 3 numeric matches)', () => {
      const result = checker.parseColor('rgba(10, 20, 30, 0.5)');
      expect(result[0]).toBe(10);
      expect(result[1]).toBe(20);
      expect(result[2]).toBe(30);
    });

    it('parses hex format', () => {
      expect(checker.parseColor('#ff8000')).toEqual([255, 128, 0]);
    });

    it('returns white for unknown formats', () => {
      expect(checker.parseColor('unknown')).toEqual([255, 255, 255]);
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

    it('works with hex colors', () => {
      const ratio = checker.calculateContrast('#000000', '#ffffff');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('WCAG AA: 4.5:1 minimum for normal text', () => {
      // Dark gray on white should pass
      const ratio = checker.calculateContrast('rgb(89, 89, 89)', 'rgb(255, 255, 255)');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('detects insufficient contrast', () => {
      // Light gray on white fails AA
      const ratio = checker.calculateContrast('rgb(200, 200, 200)', 'rgb(255, 255, 255)');
      expect(ratio).toBeLessThan(4.5);
    });
  });
});
