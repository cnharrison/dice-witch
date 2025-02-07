export const bigIntSerializer = (key: string, value: any) => {
  return typeof value === 'bigint' ? value.toString() : value;
};
