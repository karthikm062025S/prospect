export type UserRoleState = {
  role_id: string;
  saved_at: string | null;
  hidden_at: string | null;
  apply_clicked_at: string | null;
  deleted_at: string | null;
  application_id: string | null;
};

export type MergedUserRole<T> = T & Omit<UserRoleState, "role_id">;

const EMPTY_STATE: Omit<UserRoleState, "role_id"> = {
  saved_at: null,
  hidden_at: null,
  apply_clicked_at: null,
  deleted_at: null,
  application_id: null,
};

export function mergeUserRoles<T extends { id: string }>(
  roles: readonly T[],
  userRows: readonly UserRoleState[],
): {
  rows: MergedUserRole<T>[];
  visible: MergedUserRole<T>[];
  counts: { all: number; saved: number; hidden: number };
} {
  const byRoleId = new Map(userRows.map((row) => [row.role_id, row]));
  const rows = roles
    .map((role): MergedUserRole<T> => {
      const state = byRoleId.get(role.id);
      return {
        ...role,
        ...(state
          ? {
              saved_at: state.saved_at,
              hidden_at: state.hidden_at,
              apply_clicked_at: state.apply_clicked_at,
              deleted_at: state.deleted_at,
              application_id: state.application_id,
            }
          : EMPTY_STATE),
      };
    })
    .filter((role) => role.deleted_at === null && role.application_id === null);
  const visible = rows.filter((role) => role.hidden_at === null);

  return {
    rows,
    visible,
    counts: {
      all: visible.length,
      saved: visible.filter((role) => role.saved_at !== null).length,
      hidden: rows.length - visible.length,
    },
  };
}
