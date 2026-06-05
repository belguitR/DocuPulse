import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  FileSearch,
  FileText,
  FolderOpen,
  HardDriveUpload,
  LoaderCircle,
  RefreshCcw,
  Search,
  Server,
  Settings2,
  Upload,
} from "lucide-react";
import "./App.css";
import { fetchHealth, indexDocuments, searchDocuments } from "./api";
import type { HealthResponse, SearchHit } from "./types";

type View = "overview" | "search" | "ingestion";

type ActivityItem = {
  id: string;
  title: string;
  fileName: string;
  sizeLabel: string;
  typeLabel: string;
  tags: string[];
  status: "indexed" | "indexing" | "failed";
  progress: number;
  uploadedAt: string;
  source: string;
};

const quickSuggestions = ["api_specs_2024", "network_topology", "security_audit"];
const taxonomyOptions = ["pdf", "report", "note"];
const sourceOptions = ["manual-upload", "intranet", "repository"];
const horizonOptions = [
  { label: "All records", value: "all" },
  { label: "Last 24h", value: "24h" },
  { label: "Last 30d", value: "30d" },
];

function App() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [tags, setTags] = useState("");
  const [source, setSource] = useState("manual-upload");
  const [documentType, setDocumentType] = useState("pdf");
  const [indexingMessage, setIndexingMessage] = useState("");
  const [indexingError, setIndexingError] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchMeta, setSearchMeta] = useState("");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [taxonomyFilter, setTaxonomyFilter] = useState<string[]>(["pdf"]);
  const [sourceFilter, setSourceFilter] = useState<string[]>(["manual-upload"]);
  const [horizonFilter, setHorizonFilter] = useState("all");
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    void loadHealth();
  }, []);

  const selectedFilesLabel = useMemo(() => {
    if (files.length === 0) {
      return "No files selected";
    }

    if (files.length === 1) {
      return files[0].name;
    }

    return `${files.length} files selected`;
  }, [files]);

  const indexedCount = activityItems.filter((item) => item.status === "indexed").length;
  const totalDocuments = activityItems.length;
  const totalSizeInMb = activityItems.reduce((sum, item) => sum + Number(item.sizeLabel.replace(/[^\d.]/g, "") || 0), 0);
  const estimatedPages = Math.max(0, Math.round(totalSizeInMb * 14));
  const queueProgress = activityItems.length === 0 ? 0 : Math.round(activityItems.reduce((sum, item) => sum + item.progress, 0) / activityItems.length);
  const latestActivity = activityItems[0];

  const filteredResults = useMemo(() => {
    return searchResults.filter((hit) => {
      const typeMatch = taxonomyFilter.length === 0 || taxonomyFilter.includes(hit.documentType.toLowerCase());
      const sourceMatch = sourceFilter.length === 0 || sourceFilter.includes(hit.source.toLowerCase());
      const horizonMatch = matchesHorizon(hit.uploadedAt, horizonFilter);

      return typeMatch && sourceMatch && horizonMatch;
    });
  }, [horizonFilter, searchResults, sourceFilter, taxonomyFilter]);

  const queueActiveCount = activityItems.filter((item) => item.status === "indexing").length;

  async function loadHealth() {
    try {
      setHealthError("");
      const data = await fetchHealth();
      setHealth(data);
      setHealthError(
        data.api === "degraded" ? "Search engine unavailable. Start Docker Desktop and run `docker compose up -d`." : "",
      );
    } catch (error) {
      setHealth(null);
      setHealthError(error instanceof Error ? error.message : "Unable to reach the backend.");
    }
  }

  async function handleIndexSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setIndexingError("Select at least one PDF before indexing.");
      return;
    }

    const formData = new FormData();
    const currentTags = splitTags(tags);
    const pendingItems = files.map((file) => createPendingActivity(file, currentTags, source, documentType));

    for (const file of files) {
      formData.append("files", file);
    }

    formData.append("tags", tags);
    formData.append("source", source);
    formData.append("documentType", documentType);

    setActivityItems((previous) => [...pendingItems, ...previous]);

    try {
      setIsIndexing(true);
      setIndexingError("");
      setIndexingMessage("");
      const response = await indexDocuments(formData);

      setActivityItems((previous) =>
        previous.map((item) => {
          const matched = response.documents.find((document) => document.fileName === item.fileName);

          if (!matched) {
            return item;
          }

          return {
            ...item,
            id: matched.id,
            title: matched.title,
            status: "indexed",
            progress: 100,
          };
        }),
      );

      setFiles([]);
      setIndexingMessage(`${response.indexedCount} document(s) indexed successfully.`);
      await loadHealth();
    } catch (error) {
      setActivityItems((previous) =>
        previous.map((item) => (pendingItems.some((pending) => pending.id === item.id) ? { ...item, status: "failed", progress: 100 } : item)),
      );
      setIndexingError(error instanceof Error ? error.message : "Indexing failed.");
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSearch(query);
  }

  async function runSearch(rawQuery: string) {
    if (!rawQuery.trim()) {
      setSearchError("Enter a keyword or phrase to search.");
      return;
    }

    try {
      setIsSearching(true);
      setSearchError("");
      const response = await searchDocuments(rawQuery.trim());
      setQuery(rawQuery.trim());
      setSearchResults(response.hits);
      setSearchMeta(`${response.estimatedTotalHits} matches found`);
      setActiveView("search");
    } catch (error) {
      setSearchResults([]);
      setSearchMeta("");
      setSearchError(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  function toggleSelection(value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter((previous) => (previous.includes(value) ? previous.filter((entry) => entry !== value) : [...previous, value]));
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">DocuPulse</div>
          <p>Intelligence Engine</p>
        </div>

        <nav className="sidebar-nav">
          <button className={navClass(activeView === "overview")} onClick={() => setActiveView("overview")} type="button">
            <Activity size={18} />
            <span>Dashboard</span>
          </button>
          <button className={navClass(activeView === "search")} onClick={() => setActiveView("search")} type="button">
            <Search size={18} />
            <span>Knowledge Search</span>
          </button>
          <button className={navClass(activeView === "ingestion")} onClick={() => setActiveView("ingestion")} type="button">
            <HardDriveUpload size={18} />
            <span>Ingestion</span>
          </button>
        </nav>

        <button className="sidebar-primary" onClick={() => setActiveView("search")} type="button">
          <Search size={18} />
          <span>New Query</span>
        </button>

        <div className="sidebar-footer">
          <button className="sidebar-footer-link" type="button">
            <Settings2 size={18} />
            <span>Settings</span>
          </button>
          <button className="sidebar-footer-link" type="button">
            <FolderOpen size={18} />
            <span>Support</span>
          </button>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-copy">
            <p className="eyebrow">Active workspace / research</p>
            <h1>{viewTitle(activeView)}</h1>
          </div>

          <div className="topbar-actions">
            <span className={`system-pill ${health?.search === "available" ? "is-ok" : "is-warn"}`}>
              <Server size={14} />
              {health?.search === "available" ? "System active" : "System degraded"}
            </span>
            <button className="refresh-button" onClick={() => void loadHealth()} type="button">
              <RefreshCcw size={16} />
              Refresh status
            </button>
          </div>
        </header>

        <main className="content-main">
          {activeView === "overview" ? (
            <section className="overview-page">
              <div className="hero-panel">
                <h2>Intelligent Document Discovery</h2>
                <p>
                  A refined engine for high-velocity technical search. Index and query PDFs with a clean ingestion flow and
                  full-text retrieval.
                </p>

                <form className="hero-search" onSubmit={handleSearchSubmit}>
                  <Search size={24} />
                  <input
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search specifications, reports, or technical logs..."
                    type="search"
                    value={query}
                  />
                  <button className="search-kicker" type="submit">
                    {isSearching ? <LoaderCircle className="spin" size={16} /> : "Search"}
                  </button>
                </form>

                <div className="suggestion-row">
                  <span>Suggestions:</span>
                  {quickSuggestions.map((suggestion) => (
                    <button key={suggestion} onClick={() => void runSearch(suggestion.replaceAll("_", " "))} type="button">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="stats-grid">
                <article className="stat-card">
                  <p>Total documents</p>
                  <strong>{formatCount(totalDocuments)}</strong>
                </article>
                <article className="stat-card">
                  <p>Pages indexed</p>
                  <strong>{formatCount(estimatedPages)}</strong>
                </article>
                <article className="stat-card">
                  <p>Last query</p>
                  <strong>{query ? truncate(query, 18) : "N/A"}</strong>
                </article>
                <article className="stat-card inverse">
                  <p>Index size</p>
                  <strong>{(totalSizeInMb / 1024).toFixed(2)} GB</strong>
                </article>
              </div>

              <div className="overview-grid">
                <section className="card system-card">
                  <div className="card-header">
                    <h3>System Health</h3>
                    <span className={`status-chip ${health?.search === "available" ? "good" : "warn"}`}>
                      {health?.search === "available" ? "Active" : "Check stack"}
                    </span>
                  </div>

                  <div className="system-metrics">
                    <div>
                      <span>Search engine</span>
                      <strong>{health?.search === "available" ? "Stable connectivity" : "Unavailable"}</strong>
                    </div>
                    <div>
                      <span>Latency</span>
                      <strong>{health?.search === "available" ? "14ms" : "--"}</strong>
                    </div>
                  </div>

                  <div className="queue-metric">
                    <div className="queue-labels">
                      <span>Indexing queue</span>
                      <strong>{queueProgress}%</strong>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${queueProgress}%` }} />
                    </div>
                  </div>

                  <ul className="cluster-list">
                    <li>
                      <span>Cluster SYD-01</span>
                      <i />
                    </li>
                    <li>
                      <span>Cluster LDN-04</span>
                      <i />
                    </li>
                  </ul>

                  {healthError ? <p className="card-note">{healthError}</p> : null}
                </section>

                <section className="card indexed-card">
                  <div className="card-header">
                    <h3>Recently Indexed</h3>
                    <button className="ghost-button" onClick={() => setActiveView("ingestion")} type="button">
                      Explore repository
                    </button>
                  </div>

                  <div className="table-head">
                    <span>Document name</span>
                    <span>Length</span>
                    <span>Type</span>
                    <span>Timestamp</span>
                  </div>

                  <div className="table-body">
                    {activityItems.length === 0 ? (
                      <div className="empty-line">No indexed documents yet. Upload PDFs to populate the repository.</div>
                    ) : (
                      activityItems.slice(0, 5).map((item) => (
                        <div className="table-row" key={item.id}>
                          <div className="table-doc">
                            <FileText size={18} />
                            <span>{item.fileName}</span>
                          </div>
                          <span>{Math.max(1, Math.round(Number(item.sizeLabel.replace(/[^\d.]/g, "")) * 12))}p</span>
                          <span className="doc-pill">{item.typeLabel.toUpperCase()}</span>
                          <span>{relativeTime(item.uploadedAt)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </section>
          ) : null}

          {activeView === "search" ? (
            <section className="search-page">
              <form className="search-page-bar" onSubmit={handleSearchSubmit}>
                <Search size={20} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search full text across indexed PDFs"
                  type="search"
                  value={query}
                />
                <button className="search-kicker" type="submit">
                  {isSearching ? <LoaderCircle className="spin" size={16} /> : "Search"}
                </button>
              </form>

              <div className="search-meta-bar">
                <div>
                  <strong>{searchMeta || "0 matches found"}</strong>
                  <span>{query ? `Index: 0.24s for "${query}"` : "Run a search to query the indexed corpus."}</span>
                </div>
                <span>Sort: relevance</span>
              </div>

              <div className="search-layout">
                <aside className="filter-rail">
                  <section>
                    <h3>Taxonomy</h3>
                    {taxonomyOptions.map((option) => (
                      <label className="check-row" key={option}>
                        <input
                          checked={taxonomyFilter.includes(option)}
                          onChange={() => toggleSelection(option, setTaxonomyFilter)}
                          type="checkbox"
                        />
                        <span>{option.toUpperCase()}</span>
                      </label>
                    ))}
                  </section>

                  <section>
                    <h3>Origin</h3>
                    {sourceOptions.map((option) => (
                      <label className="check-row" key={option}>
                        <input
                          checked={sourceFilter.includes(option)}
                          onChange={() => toggleSelection(option, setSourceFilter)}
                          type="checkbox"
                        />
                        <span>{option.replace("-", " ").toUpperCase()}</span>
                      </label>
                    ))}
                  </section>

                  <section>
                    <h3>Horizon</h3>
                    <div className="horizon-list">
                      {horizonOptions.map((option) => (
                        <button
                          className={horizonFilter === option.value ? "horizon-button active" : "horizon-button"}
                          key={option.value}
                          onClick={() => setHorizonFilter(option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>
                </aside>

                <div className="search-results">
                  {searchError ? <div className="message-card error">{searchError}</div> : null}
                  {filteredResults.length === 0 ? (
                    <div className="result-card empty-card">
                      <h3>No results yet</h3>
                      <p>Run a query after indexing a few PDFs. Filters are applied client-side on the current result set.</p>
                    </div>
                  ) : (
                    filteredResults.map((hit) => (
                      <article className="result-card" key={hit.id}>
                        <div className="result-card-top">
                          <div>
                            <div className="result-tag-row">
                              <span className="tone-tag">{hit.documentType.toUpperCase()}</span>
                              <span className="result-ref">Ref: {hit.id.slice(0, 8)}</span>
                            </div>
                            <h3>{hit.title}</h3>
                          </div>
                          <button className="kebab-button" type="button">
                            <span />
                            <span />
                            <span />
                          </button>
                        </div>

                        <p className="result-snippet">{highlightSnippet(hit.snippet, query)}</p>

                        <div className="result-footer">
                          <span>
                            <FileText size={14} />
                            {hit.fileName}
                          </span>
                          <span>
                            <CalendarDays size={14} />
                            {new Date(hit.uploadedAt).toLocaleDateString()}
                          </span>
                          <span>
                            <FolderOpen size={14} />
                            {hit.source}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {activeView === "ingestion" ? (
            <section className="ingestion-page">
              <div className="page-copy">
                <h2>Document Ingestion</h2>
                <p>Upload and index your proprietary knowledge base for immediate high-fidelity search capability.</p>
              </div>

              <div className="ingestion-layout">
                <div className="ingestion-main">
                  <form className="dropzone-card" onSubmit={handleIndexSubmit}>
                    <label className="dropzone-surface">
                      <input
                        accept="application/pdf"
                        multiple
                        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                        type="file"
                      />
                      <div className="dropzone-icon">
                        <Upload size={28} />
                      </div>
                      <h3>Drag and drop PDFs</h3>
                      <p>
                        or <span>browse your local files</span>
                      </p>
                      <small>MAX 50MB • PDF</small>
                    </label>

                    <div className="dropzone-meta">
                      <div className="meta-field">
                        <span>Selected files</span>
                        <strong>{selectedFilesLabel}</strong>
                      </div>
                      <div className="meta-field">
                        <span>Source</span>
                        <input onChange={(event) => setSource(event.target.value)} type="text" value={source} />
                      </div>
                      <div className="meta-field">
                        <span>Document type</span>
                        <input onChange={(event) => setDocumentType(event.target.value)} type="text" value={documentType} />
                      </div>
                    </div>

                    <div className="tag-panel">
                      <div className="card-header">
                        <h3>Batch metadata tags</h3>
                      </div>
                      <input
                        onChange={(event) => setTags(event.target.value)}
                        placeholder="project alpha, financial, audit"
                        type="text"
                        value={tags}
                      />
                      <div className="tag-list">
                        {splitTags(tags).length === 0 ? <span className="tag-placeholder">No tags added yet</span> : null}
                        {splitTags(tags).map((tag) => (
                          <span className="doc-pill" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="dropzone-actions">
                      <button className="primary-button" disabled={isIndexing} type="submit">
                        {isIndexing ? <LoaderCircle className="spin" size={16} /> : <FileSearch size={16} />}
                        {isIndexing ? "Indexing..." : "Index selected PDFs"}
                      </button>
                    </div>

                    {indexingMessage ? <div className="message-card success">{indexingMessage}</div> : null}
                    {indexingError ? <div className="message-card error">{indexingError}</div> : null}
                  </form>

                  <section className="card activity-card">
                    <div className="card-header">
                      <h3>Recent Activity</h3>
                      <div className="legend">
                        <span>
                          <i className="is-indexing" />
                          Indexing
                        </span>
                        <span>
                          <i className="is-complete" />
                          Complete
                        </span>
                      </div>
                    </div>

                    <div className="activity-list">
                      {activityItems.length === 0 ? (
                        <div className="empty-line">Uploads and indexing events will appear here.</div>
                      ) : (
                        activityItems.map((item) => (
                          <article className="activity-row" key={item.id}>
                            <div className="activity-icon">
                              {item.status === "failed" ? <Database size={18} /> : <FileText size={18} />}
                            </div>
                            <div className="activity-copy">
                              <strong>{item.fileName}</strong>
                              <span>
                                {item.sizeLabel} • {item.typeLabel.toUpperCase()}
                              </span>
                            </div>
                            <div className="activity-tags">
                              {item.tags.map((tag) => (
                                <span className="doc-pill" key={`${item.id}-${tag}`}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <div className="activity-progress">
                              <div className="progress-track slim">
                                <span style={{ width: `${item.progress}%` }} />
                              </div>
                              <span>{item.status === "indexed" ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}</span>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </section>
                </div>

                <aside className="queue-card">
                  <div className="card-header">
                    <h3>Queue Status</h3>
                    <span className="queue-badge">{queueActiveCount} active</span>
                  </div>

                  <div className="queue-ring">
                    <div className="ring-shell" style={{ ["--ring-angle" as string]: `${Math.round(queueProgress * 3.6)}` }}>
                      <div className="ring-core">
                        <strong>{queueProgress}%</strong>
                        <span>Processed</span>
                      </div>
                    </div>
                  </div>

                  <div className="queue-bars">
                    <div>
                      <div className="queue-labels">
                        <span>PDF parsing</span>
                        <strong>{indexedCount} / {totalDocuments}</strong>
                      </div>
                      <div className="progress-track slim">
                        <span style={{ width: `${totalDocuments === 0 ? 0 : (indexedCount / totalDocuments) * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="queue-labels">
                        <span>Vector indexing</span>
                        <strong>{queueProgress}%</strong>
                      </div>
                      <div className="progress-track slim">
                        <span style={{ width: `${queueProgress}%` }} />
                      </div>
                    </div>
                  </div>

                  <button className="ghost-button full-width" onClick={() => setActiveView("overview")} type="button">
                    View system logs
                  </button>

                  {latestActivity ? (
                    <div className="queue-footer">
                      <span>Latest item</span>
                      <strong>{latestActivity.fileName}</strong>
                    </div>
                  ) : null}
                </aside>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function splitTags(rawTags: string): string[] {
  return rawTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function highlightSnippet(snippet: string, query: string) {
  if (!query.trim()) {
    return snippet;
  }

  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return snippet;
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const pieces = snippet.split(pattern);

  return pieces.map((piece, index) =>
    terms.some((term) => piece.toLowerCase() === term.toLowerCase()) ? (
      <mark key={`${piece}-${index}`}>{piece}</mark>
    ) : (
      <span key={`${piece}-${index}`}>{piece}</span>
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createPendingActivity(file: File, tags: string[], source: string, documentType: string): ActivityItem {
  return {
    id: `pending-${crypto.randomUUID()}`,
    title: file.name.replace(/\.pdf$/i, ""),
    fileName: file.name,
    sizeLabel: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
    typeLabel: documentType,
    tags,
    status: "indexing",
    progress: 72,
    uploadedAt: new Date().toISOString(),
    source,
  };
}

function matchesHorizon(uploadedAt: string, horizon: string): boolean {
  if (horizon === "all") {
    return true;
  }

  const delta = Date.now() - new Date(uploadedAt).getTime();

  if (horizon === "24h") {
    return delta <= 24 * 60 * 60 * 1000;
  }

  if (horizon === "30d") {
    return delta <= 30 * 24 * 60 * 60 * 1000;
  }

  return true;
}

function navClass(isActive: boolean): string {
  return isActive ? "nav-link active" : "nav-link";
}

function viewTitle(view: View): string {
  if (view === "overview") {
    return "Overview";
  }

  if (view === "search") {
    return "Knowledge Search";
  }

  return "Document Ingestion";
}

export default App;
