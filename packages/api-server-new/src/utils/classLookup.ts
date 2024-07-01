const classLookupTable: Record<string, number | undefined> = {
  unknown: 0,
  scout: 1,
  sniper: 2,
  soldier: 3,
  demoman: 4,
  medic: 5,
  heavy: 6,
  pyro: 7,
  spy: 8,
  engineer: 9,
};

export const tryParseClass = (input: string) => {
  return classLookupTable[input.trim().toLowerCase()] ?? input;
}