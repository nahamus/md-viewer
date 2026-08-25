import { useRef, useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

interface Props {
  menus: Menu[];
}

export function MenuBar({ menus }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpenMenu(null));

  return (
    <div className="menu-bar" ref={ref}>
      <span className="menu-bar-brand">📝 MD Viewer</span>
      {menus.map((menu) => (
        <div className="menu" key={menu.label}>
          <button
            type="button"
            className={`menu-trigger ${openMenu === menu.label ? "menu-trigger--open" : ""}`}
            onClick={() => setOpenMenu((prev) => (prev === menu.label ? null : menu.label))}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <div className="menu-dropdown">
              {menu.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect();
                    setOpenMenu(null);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
