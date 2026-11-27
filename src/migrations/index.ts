import * as migration_20261121_073449_initial_schema from './20261121_073449_initial_schema';
import * as migration_20261122_131531_mobile_notifications from './20261122_131531_mobile_notifications';
import * as migration_20261122_195151_account_deletion from './20261122_195151_account_deletion';
import * as migration_20261124_112458_add_roles_to_users from './20261124_112458_add_roles_to_users';

export const migrations = [
  {
    up: migration_20261121_073449_initial_schema.up,
    down: migration_20261121_073449_initial_schema.down,
    name: '20261121_073449_initial_schema',
  },
  {
    up: migration_20261122_131531_mobile_notifications.up,
    down: migration_20261122_131531_mobile_notifications.down,
    name: '20261122_131531_mobile_notifications',
  },
  {
    up: migration_20261122_195151_account_deletion.up,
    down: migration_20261122_195151_account_deletion.down,
    name: '20261122_195151_account_deletion',
  },
  {
    up: migration_20261124_112458_add_roles_to_users.up,
    down: migration_20261124_112458_add_roles_to_users.down,
    name: '20261124_112458_add_roles_to_users'
  },
];
