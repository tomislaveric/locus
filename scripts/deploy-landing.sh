#!/usr/bin/env bash
# Safely sync the staged landing artifact to the configured remote webroot.
#
# Required environment:
#   STAGING_DIR              absolute path to the exported artifact directory
#   LANDING_SSH_HOST         shared-host SSH hostname
#   LANDING_SSH_USER         SSH account username
#   LANDING_SSH_PRIVATE_KEY  private key authorized for that account
#   LANDING_REMOTE_PATH      existing dedicated absolute landing webroot
#   LANDING_SSH_PORT         SSH port
#
# The script never prints secret values. It validates configuration, pins the
# host key via ssh-keyscan, verifies the remote directory, then runs
# `rsync -az --delete` scoped to the validated webroot only.

set -euo pipefail

fail() {
  echo "::error::$1" >&2
  exit 1
}

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Missing required configuration: ${name}"
  fi
}

require STAGING_DIR
require LANDING_SSH_HOST
require LANDING_SSH_USER
require LANDING_SSH_PRIVATE_KEY
require LANDING_REMOTE_PATH
require LANDING_SSH_PORT

if [[ ! -d "${STAGING_DIR}" ]]; then
  fail "Staging directory does not exist: ${STAGING_DIR}"
fi

if [[ ! "${LANDING_SSH_PORT}" =~ ^[0-9]+$ ]] || (( LANDING_SSH_PORT < 1 || LANDING_SSH_PORT > 65535 )); then
  fail "LANDING_SSH_PORT must be a valid port number"
fi

remote_path="${LANDING_REMOTE_PATH}"
# Reject non-absolute paths, the filesystem root, traversal components, and the
# bare home directory so --delete can never target a broad or unintended path.
if [[ "${remote_path}" != /* ]]; then
  fail "LANDING_REMOTE_PATH must be an absolute path"
fi
if [[ "${remote_path}" == *".."* ]]; then
  fail "LANDING_REMOTE_PATH must not contain traversal components"
fi
normalized="${remote_path%/}"
if [[ -z "${normalized}" ]]; then
  fail "LANDING_REMOTE_PATH must not be the filesystem root"
fi
case "${normalized}" in
  "~"|"~/"*|'$HOME'*)
    fail "LANDING_REMOTE_PATH must be a dedicated directory, not the home directory"
    ;;
esac

workdir="$(mktemp -d)"
cleanup() {
  rm -rf "${workdir}"
}
trap cleanup EXIT

key_file="${workdir}/id_deploy"
known_hosts="${workdir}/known_hosts"

umask 077
printf '%s\n' "${LANDING_SSH_PRIVATE_KEY}" > "${key_file}"
chmod 600 "${key_file}"

# Pin the host key; never disable strict host-key checking globally.
if ! ssh-keyscan -p "${LANDING_SSH_PORT}" -H "${LANDING_SSH_HOST}" > "${known_hosts}" 2>/dev/null; then
  fail "ssh-keyscan failed for ${LANDING_SSH_HOST}:${LANDING_SSH_PORT}"
fi
if [[ ! -s "${known_hosts}" ]]; then
  fail "ssh-keyscan returned no host key for ${LANDING_SSH_HOST}:${LANDING_SSH_PORT}"
fi

ssh_opts=(
  -i "${key_file}"
  -o "UserKnownHostsFile=${known_hosts}"
  -o "StrictHostKeyChecking=yes"
  -o "IdentitiesOnly=yes"
  -o "BatchMode=yes"
  -p "${LANDING_SSH_PORT}"
)

remote="${LANDING_SSH_USER}@${LANDING_SSH_HOST}"

# Verify connectivity and that the remote webroot already exists. The directory
# is never created automatically.
if ! ssh "${ssh_opts[@]}" "${remote}" "test -d $(printf '%q' "${normalized}")"; then
  fail "Remote landing webroot is missing or SSH failed: ${normalized}"
fi

echo "Syncing landing artifact to ${remote}:${normalized}/"
rsync -az --delete \
  -e "ssh ${ssh_opts[*]}" \
  "${STAGING_DIR}/" \
  "${remote}:${normalized}/"

echo "Landing deployment complete."
