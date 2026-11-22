import * as migration_20261121_073449_initial_schema from './20261121_073449_initial_schema';
import * as migration_20261122_131531_mobile_notifications from './20261122_131531_mobile_notifications';

export const migrations = [
  {
    up: migration_20261121_073449_initial_schema.up,
    down: migration_20261121_073449_initial_schema.down,
    name: '20261121_073449_initial_schema',
  },
  {
    up: migration_20261122_131531_mobile_notifications.up,
    down: migration_20261122_131531_mobile_notifications.down,
    name: '20261122_131531_mobile_notifications'
  },
];
