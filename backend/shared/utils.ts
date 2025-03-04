export const bigIntSerializer = (_: string, value: any) => {
  return typeof value === 'bigint' ? value.toString() : value;
};
