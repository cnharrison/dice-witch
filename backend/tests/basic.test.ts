describe('Basic Tests', () => {
  test('simple arithmetic', () => {
    expect(1 + 2).toBe(3);
  });

  test('truthy values', () => {
    expect(true).toBeTruthy();
    expect(false).toBeFalsy();
  });

  test('Basic test', () => {
    expect(true).toBe(true);
  });
});