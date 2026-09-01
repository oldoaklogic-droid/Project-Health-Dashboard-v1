import { useState, useEffect, useRef } from "react";

const SearchIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const FolderIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>;
const CalculatorIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>;
const AlertCircleIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
const BarChartIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const UsersIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const TrendingUpIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
const DefaultIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;

const getIcon = (type, module) => {
  if (module === 'projects') return <FolderIcon />;
  if (module === 'estimating') return <CalculatorIcon />;
  if (module === 'reports') return <BarChartIcon />;
  if (module === 'pipeline') return <TrendingUpIcon />;
  if (module === 'manager') return <UsersIcon />;
  if (type === 'action') return <AlertCircleIcon />;
  return <DefaultIcon />;
};

const getRecentItems = () => {
  try {
    const raw = localStorage.getItem('cdi_recent_search');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const addRecentItem = (item) => {
  try {
    const recents = getRecentItems();
    const filtered = recents.filter(r => r.id !== item.id);
    filtered.unshift(item);
    localStorage.setItem('cdi_recent_search', JSON.stringify(filtered.slice(0, 5)));
  } catch {}
};

export function GlobalSearch({ navigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const inputRef = useRef(null);
  const paletteRef = useRef(null);
  const listRef = useRef(null);
  const timerRef = useRef(null);
  const requestRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const openerRef = useRef(null);

  // Toggle overlay on Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isSearchShortcut = (e.metaKey || e.ctrlKey) && (e.code === "KeyK" || e.key.toLowerCase() === "k");
      if (isSearchShortcut) {
        e.preventDefault();
        e.stopPropagation();
        openerRef.current = document.activeElement;
        setIsOpen(true);
      }
    };
    const handleOpenRequest = () => {
      openerRef.current = document.activeElement;
      setIsOpen(true);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("cdi-open-global-search", handleOpenRequest);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("cdi-open-global-search", handleOpenRequest);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 10);
      document.body.classList.add("search-open");
    } else {
      document.body.classList.remove("search-open");
      openerRef.current?.focus?.();
    }
    return () => document.body.classList.remove("search-open");
  }, [isOpen]);

  // Fetch results
  useEffect(() => {
    const requestSequence = ++requestSequenceRef.current;
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }
    
    setLoading(true);
    setError(null);
    clearTimeout(timerRef.current);
    requestRef.current?.abort();
    
    timerRef.current = setTimeout(async () => {
      try {
        const controller = new AbortController();
        requestRef.current = controller;
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Search failed.");
        const data = await response.json();
        if (requestSequence !== requestSequenceRef.current) return;
        setResults(data.results || []);
        setSelectedIndex(0);
      } catch (err) {
        if (err.name !== "AbortError" && requestSequence === requestSequenceRef.current) setError("Unable to search right now.");
      } finally {
        if (requestSequence === requestSequenceRef.current) setLoading(false);
      }
    }, 200);
    
    return () => {
      clearTimeout(timerRef.current);
      requestRef.current?.abort();
    };
  }, [query]);

  // Handle keyboard navigation in list
  useEffect(() => {
    const handleNavigation = (e) => {
      if (!isOpen) return;
      
      const items = query.trim() ? results : getRecentItems();
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, Math.max(0, items.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          handleSelect(items[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === "Tab") {
        const focusable = [...(paletteRef.current?.querySelectorAll('input, button, [href], [tabindex]:not([tabindex="-1"])') || [])]
          .filter((element) => !element.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    
    document.addEventListener("keydown", handleNavigation);
    return () => document.removeEventListener("keydown", handleNavigation);
  }, [isOpen, results, query, selectedIndex]);

  // Keep selected item in view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex];
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleSelect = (item) => {
    addRecentItem(item);
    setIsOpen(false);
    
    if (item.route) {
      const parts = item.route.replace(/^\/+|\/+$/g, "").split("/");
      if (parts[1] && (parts[0] === "pipeline" || parts[0] === "estimating")) {
        const intakeId = decodeURIComponent(parts[1]);
        localStorage.setItem("cdi_active_intake_id", intakeId);
        window.dispatchEvent(new CustomEvent("cdi-active-intake-change", { detail: intakeId }));
      }
      navigate(parts[0] || "home", parts[1] || "");
    }
  };

  if (!isOpen) return null;

  const displayItems = query.trim() ? results : getRecentItems();

  return (
    <div className="search-overlay fade-in" onClick={() => setIsOpen(false)} data-testid="search-overlay">
      <div ref={paletteRef} className="search-palette" role="dialog" aria-modal="true" aria-label="Global search" onClick={e => e.stopPropagation()} data-testid="search-palette">
        <div className="search-input-wrap">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, clients, or actions..."
            aria-label="Search"
            aria-controls="global-search-results"
            aria-activedescendant={displayItems[selectedIndex] ? `global-search-option-${selectedIndex}` : undefined}
            data-testid="input-global-search"
          />
          <span className="search-kbd-hint">ESC</span>
        </div>
        
        <div className="search-results-area">
          {!query.trim() && displayItems.length > 0 && (
            <div className="search-section-header">Recent</div>
          )}
          
          {loading && !results.length && (
            <div className="search-notice loading-notice">Searching...</div>
          )}
          
          {error && (
            <div className="search-notice error-notice">{error}</div>
          )}
          
          {!loading && !error && query.trim() && displayItems.length === 0 && (
            <div className="search-notice empty-notice">
              <FolderIcon />
              <p>No results found for "{query}"</p>
            </div>
          )}
          
          {(!loading || results.length > 0) && !error && displayItems.length > 0 && (
            <div className="search-results" id="global-search-results" ref={listRef} role="listbox" aria-label="Search results">
              {displayItems.map((item, i) => (
                <button
                  key={`${item.id}-${i}`}
                  id={`global-search-option-${i}`}
                  className={`search-result-item ${i === selectedIndex ? "selected" : ""}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  role="option"
                  aria-selected={i === selectedIndex}
                  data-testid={`search-result-${item.id}`}
                >
                  <div className="search-result-icon">
                    {getIcon(item.type, item.module)}
                  </div>
                  <div className="search-result-content">
                    <span className="search-result-title">{item.title}</span>
                    <span className="search-result-subtitle">{item.subtitle}</span>
                  </div>
                  <div className="search-result-meta">
                    <span className="search-result-module">{item.module}</span>
                    {item.health && <span className={`badge ${item.health.toLowerCase()}`}>{item.health}</span>}
                    {item.status && <span className="search-result-meta-text">{item.status}</span>}
                    {item.pm && <span className="search-result-meta-text">{item.pm}</span>}
                    {item.dueDate && <span className="search-result-meta-text">Due: {item.dueDate}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          
          {!query.trim() && displayItems.length === 0 && (
            <div className="search-idle-state">
              <SearchIcon />
              <p>Start typing to search projects, actions, or reports</p>
            </div>
          )}
        </div>
        
        <div className="search-footer">
          <div className="search-footer-commands">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>esc</kbd> Dismiss</span>
          </div>
          <div className="search-footer-brand">
            <strong>PROJECT_SEARCH_V1</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
