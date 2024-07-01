const teamLookup: Record<string, number | undefined> = {
  teamless: 0,
  spectator: 1,
  red: 2,
  blu: 3,
};

export const tryParseTeam = (input: string) => {
  return teamLookup[input.trim().toLowerCase()] ?? input;
}