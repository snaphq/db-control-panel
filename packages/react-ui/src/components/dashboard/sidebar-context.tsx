"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const STORAGE_KEY = "sidebar-width";
const DEFAULT_WIDTH = 224;
const MIN_WIDTH = 140;
const MAX_WIDTH = 320;
const COLLAPSE_THRESHOLD = 100;

interface SidebarContextValue {
  width: number;
  collapsed: boolean;
  toggle: () => void;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  width: DEFAULT_WIDTH,
  collapsed: false,
  toggle: () => {},
  activeMenuId: null,
  setActiveMenuId: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const lastExpandedWidth = useRef(DEFAULT_WIDTH);

  // Hydrate from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) {
        setWidth(parsed);
        if (parsed > 0) lastExpandedWidth.current = parsed;
      }
    }
  }, []);

  // Persist width changes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
    if (width > 0) lastExpandedWidth.current = width;
  }, [width]);

  const collapsed = width === 0;

  const toggle = useCallback(() => {
    setWidth((w) => (w === 0 ? lastExpandedWidth.current || DEFAULT_WIDTH : 0));
  }, []);

  // Drag resize handler — attached to the handle's onMouseDown
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      setIsResizing(true);

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = startWidth + delta;

        if (newWidth < COLLAPSE_THRESHOLD) {
          setWidth(0);
        } else {
          setWidth(Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH));
        }
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width],
  );

  return (
    <SidebarContext.Provider
      value={{ width, collapsed, toggle, activeMenuId, setActiveMenuId }}
    >
      <div
        className="h-screen overflow-hidden lg:grid"
        style={{
          gridTemplateColumns: `${width}px minmax(0, 1fr)`,
          transition: isResizing
            ? "none"
            : "grid-template-columns 300ms ease-in-out",
        }}
      >
        {children}

        {/* Drag handle on sidebar right edge */}
        <div
          onMouseDown={handleMouseDown}
          className="fixed top-0 bottom-0 z-50 hidden lg:block group"
          style={{
            left: `${width}px`,
            width: "6px",
            cursor: "col-resize",
            transition: isResizing ? "none" : "left 300ms ease-in-out",
          }}
        >
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] opacity-0 group-hover:opacity-100 bg-border transition-opacity" />
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
