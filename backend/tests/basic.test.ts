// Basic test to see if Jest is working

describe('Basic Tests', () => {
  test('simple arithmetic', () => {
    expect(1 + 2).toBe(3);
  });

  test('truthy values', () => {
    expect(true).toBeTruthy();
    expect(false).toBeFalsy();
  });
});