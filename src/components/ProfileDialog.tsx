import { useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import type { ThemePreference, UserProfile } from "../types";

interface Props {
  title: string;
  initial?: Partial<Pick<UserProfile, "name" | "label" | "avatar" | "theme">>;
  onSave: (profile: { name: string; label?: string; avatar?: string; theme?: ThemePreference }) => void;
  onClose: () => void;
}

const AVATAR_PRESETS = ["👤", "🦊", "🐱", "🐼", "🐸", "🦉", "🐙", "🌟", "🎨", "📚", "🚀", "☕"];
const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ProfileDialog({ title, initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [avatar, setAvatar] = useState(initial?.avatar ?? "");
  const [theme, setTheme] = useState<ThemePreference>(initial?.theme ?? "system");

  useEscapeKey(onClose);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave({ name: trimmedName, label: label.trim() || undefined, avatar: avatar.trim() || undefined, theme });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <form className="source-add-form" onSubmit={handleSubmit}>
            <label>
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </label>
            <label>
              Label <span className="field-hint">(e.g. occupation)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Software Engineer" />
            </label>
            <label>
              Avatar
              <input
                className="avatar-input"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value.slice(0, 8))}
                placeholder="👤"
              />
            </label>
            <div className="avatar-presets">
              {AVATAR_PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`avatar-preset ${avatar === emoji ? "avatar-preset--active" : ""}`}
                  onClick={() => setAvatar(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {/* Not a <label> — there's no single input to associate one with, just a row of buttons. */}
            <div className="field-group">
              <span>Theme</span>
              <div className="theme-presets">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`theme-preset ${theme === opt.value ? "theme-preset--active" : ""}`}
                    onClick={() => setTheme(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="primary-btn">
              Save
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
