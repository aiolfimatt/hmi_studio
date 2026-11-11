/**
 * Shared enums for access control and the local audit trail.
 */

// User access levels (operator → maintainer → installer).
const USER_LEVEL = {
  OPERATORE: 0,
  MANUTENTORE: 1,
  INSTALLATORE: 2,
};

// event_type codes written to the local audit trail (data/audit_log.jsonl via
// services/eventLog). Each auditable action carries one of these numeric tags.
const HMI_EVENT = {
  VALUE_MODIFIED: 512,   // a value/parameter was written to the PLC
  LOGIN: 513,            // successful login
  LOGOUT: 514,           // logout
  LOGIN_LOCKED: 516,     // account locked after too many failed attempts
  SCRIPT_RUN: 517,       // a server-side button script was executed
  USER_CREATED: 612,
  USER_DELETED: 613,
  USER_MODIFIED: 614,    // profile fields changed (name/email/group/expiry)
  PASSWORD_CHANGED: 615,
  USER_DISABLED: 616,    // is_active → false
  USER_ENABLED: 617,     // is_active → true
};

module.exports = { USER_LEVEL, HMI_EVENT };
