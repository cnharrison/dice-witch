import { mapEssences } from '../core/services/DiceService/methods/createEmbed';

describe('mapEssences', () => {
  test('maps d6 results inside brackets to Essence names', () => {
    const output = mapEssences('3d6: [1, 4, 6]');

    expect(output).toBe('3d6: [🧙‍♀️ Authority, 🐈‍⬛ Stillness, 📖 Wisdom]');
  });

  test('maps all six d6 faces correctly', () => {
    const output = mapEssences('[1, 2, 3, 4, 5, 6]');

    expect(output).toBe('[🧙‍♀️ Authority, 🌿 Nature, ☕ Empathy, 🐈‍⬛ Stillness, 🧉 Imagination, 📖 Wisdom]');
  });

  test('handles duplicate die results', () => {
    const output = mapEssences('2d6: [3, 3]');

    expect(output).toBe('2d6: [☕ Empathy, ☕ Empathy]');
  });

  test('leaves non-d6 values unchanged', () => {
    const output = mapEssences('1d20: [15]');

    expect(output).toBe('1d20: [15]');
  });
});
