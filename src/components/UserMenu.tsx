import { useRef, useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import type { UserProfile } from "../types";

interface Props {
  users: UserProfile[];
  currentUserId: string;
  onSwitch: (id: string) => void;
  onRequestCreate: () => void;
  onRequestEdit: (user: UserProfile) => void;
  onDelete: (id: string, name: string) => void;
}

export function UserMenu({ users, currentUserId, onSwitch, onRequestCreate, onRequestEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const currentUser = users.find((u) => u.id === currentUserId);

  function handleTriggerClick() {
    // An unnamed (first-run) profile has nothing to switch between yet —
    // jump straight to letting the user set it up, instead of opening a
    // dropdown with only one, unlabeled entry.
    if (currentUser && !currentUser.name) {
      onRequestEdit(currentUser);
      return;
    }
    setOpen((v) => !v);
  }

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="menu-trigger user-menu-trigger" onClick={handleTriggerClick}>
        <span>{currentUser?.avatar || "👤"}</span>
        <span>{currentUser?.name || "Default"}</span>
      </button>
      {open && (
        <div className="menu-dropdown user-menu-dropdown">
          <div className="user-menu-label">Profiles (stored in this browser only)</div>
          <ul className="user-list">
            {users.map((user) => (
              <li key={user.id} className="user-list-item">
                <button
                  type="button"
                  className={`user-list-name ${user.id === currentUserId ? "user-list-name--active" : ""}`}
                  onClick={() => {
                    onSwitch(user.id);
                    setOpen(false);
                  }}
                >
                  <span className="user-list-avatar">{user.avatar || "👤"}</span>
                  <span className="user-list-text">
                    <span className="user-list-name-text">{user.name || "Default"}</span>
                    {user.label && <span className="user-list-label-text">{user.label}</span>}
                  </span>
                </button>
                <div className="user-list-actions">
                  <button type="button" title="Edit profile" onClick={() => onRequestEdit(user)}>
                    ✎
                  </button>
                  {users.length > 1 && (
                    <button type="button" title="Delete profile" onClick={() => onDelete(user.id, user.name)}>
                      🗑
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="user-menu-add"
            onClick={() => {
              setOpen(false);
              onRequestCreate();
            }}
          >
            + New profile
          </button>
        </div>
      )}
    </div>
  );
}
