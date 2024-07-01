import { Knex } from 'knex';

declare module 'knex/types/tables' {
  interface MapsTable {
    name: string;
    kill_count: number;
    overview_state: number;
  }

  interface KillsTable {
    id: number;
    map_id: number;
    timestamp: number;
    killer_class: number;
    killer_weapon: number;
    killer_x: number;
    killer_y: number;
    killer_z: number;
    victim_class: number;
    victim_x: number;
    victim_y: number;
    victim_z: number;
    customkill: number;
    damagebits: number;
    death_flags: number;
    team: number;
  }

  interface LinesTable {
    map_id: number;
    state: string;
    class: number;
    team: number;
    data: Buffer;
  }

  interface Tables {
    maps: MapsTable;
    kills: KillsTable;
    new_player_lines: LinesTable;
  }
}
