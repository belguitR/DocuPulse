import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Braces,
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
  Plus,
  X,
} from "lucide-react";
import "./App.css";
import { fetchDocuments, fetchHealth, indexDocuments, openDocumentInDesktopApp, searchDocuments, toApiUrl } from "./api";
import type { DocumentSummary, HealthResponse, SearchHit } from "./types";

type View = "overview" | "search" | "ingestion";

type ActivityItem = {
  id: string;
  title: string;
  fileName: string;
  contentLength: number;
  sizeLabel: string;
  typeLabel: string;
  tags: string[];
  status: "queued" | "parsing" | "indexing" | "indexed" | "failed";
  progress: number;
  uploadedAt: string;
  source: string;
  applicationNames: string[];
  documentCategory: string;
  programmingLanguages: string[];
};

type ProcessingPhase = {
  label: string;
  detail: string;
};

const quickSuggestions = ["api_specs_2024", "network_topology", "security_audit"];
const taxonomyOptions = ["pdf", "docx"];
const sourceOptions = ["manual-upload", "intranet", "repository"];
const defaultApplications = ["M3", "Y2", "SFCC"];
const documentCategoryOptions = [
  { value: "configuration", label: "Configuration" },
  { value: "training", label: "Formation" },
  { value: "support-procedure", label: "Support procedure" },
  { value: "general-reference", label: "General reference" },
];
const programmingLanguageOptions = ["Java", "JavaScript", "TypeScript", "SQL", "Python", "C#", "Apex", "XML", "PHP"];
const applicationStorageKey = "rossignol-applications";
const horizonOptions = [
  { label: "All records", value: "all" },
  { label: "Last 24h", value: "24h" },
  { label: "Last 30d", value: "30d" },
];

function App() {
  const dragDepthRef = useRef(0);
  const [activeView, setActiveView] = useState<View>("search");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [tags, setTags] = useState("");
  const [applications, setApplications] = useState<string[]>(() => loadStoredApplications());
  const [selectedApplications, setSelectedApplications] = useState<string[]>(() => [loadStoredApplications()[0] ?? defaultApplications[0]]);
  const [newApplicationName, setNewApplicationName] = useState("");
  const [documentCategory, setDocumentCategory] = useState(documentCategoryOptions[0].value);
  const [programmingLanguages, setProgrammingLanguages] = useState<string[]>([]);
  const [source, setSource] = useState("manual-upload");
  const [indexingMessage, setIndexingMessage] = useState("");
  const [indexingError, setIndexingError] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>({
    label: "Idle",
    detail: "Select PDF or DOCX files, then start indexing.",
  });
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchMeta, setSearchMeta] = useState("");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchHit | null>(null);
  const [isOpeningDesktopApp, setIsOpeningDesktopApp] = useState(false);
  const [readerNotice, setReaderNotice] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState<string[]>(["pdf", "docx"]);
  const [sourceFilter, setSourceFilter] = useState<string[]>(["manual-upload"]);
  const [horizonFilter, setHorizonFilter] = useState("all");
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    void loadHealth();
    void loadDocuments();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(applicationStorageKey, JSON.stringify(applications));
  }, [applications]);

  const selectedFilesLabel = useMemo(() => {
    if (files.length === 0) {
      return "No file selected";
    }

    return files[0].name;
  }, [files]);

  const indexedCount = activityItems.filter((item) => item.status === "indexed").length;
  const totalDocuments = activityItems.length;
  const totalSizeInMb = activityItems.reduce((sum, item) => sum + Number(item.sizeLabel.replace(/[^\d.]/g, "") || 0), 0);
  const estimatedPages = Math.max(
    0,
    Math.round(activityItems.reduce((sum, item) => sum + estimatePages(item), 0)),
  );
  const queueProgress = activityItems.length === 0 ? 0 : Math.round(activityItems.reduce((sum, item) => sum + item.progress, 0) / activityItems.length);
  const latestActivity = activityItems[0];
  const parsedCount = activityItems.filter((item) => ["indexing", "indexed"].includes(item.status)).length;
  const failedCount = activityItems.filter((item) => item.status === "failed").length;

  const filteredResults = useMemo(() => {
    return searchResults.filter((hit) => {
      const typeMatch = taxonomyFilter.length === 0 || taxonomyFilter.includes(hit.documentType.toLowerCase());
      const sourceMatch = sourceFilter.length === 0 || sourceFilter.includes(hit.source.toLowerCase());
      const horizonMatch = matchesHorizon(hit.uploadedAt, horizonFilter);

      return typeMatch && sourceMatch && horizonMatch;
    });
  }, [horizonFilter, searchResults, sourceFilter, taxonomyFilter]);

  const queueActiveCount = activityItems.filter((item) => ["queued", "parsing", "indexing"].includes(item.status)).length;

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

  async function loadDocuments() {
    try {
      const response = await fetchDocuments();
      setActivityItems(response.documents.map(documentToActivity).sort((left, right) => new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime()));

      if (response.documents.length > 0) {
        setProcessingPhase({
          label: "Complete",
          detail: `${response.documents.length} indexed document(s) are searchable.`,
        });
      }
    } catch {
      // The health indicator already reports backend/search availability.
    }
  }

  async function handleIndexSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setIndexingError("Select at least one PDF or DOCX before indexing.");
      return;
    }

    const formData = new FormData();
    const currentTags = splitTags(tags);
    const batchId = crypto.randomUUID();
    const pendingItems = files.map((file, index) =>
      createPendingActivity(file, currentTags, source, selectedApplications, documentCategory, programmingLanguages, batchId, index),
    );

    for (const file of files) {
      formData.append("files", file);
    }

    formData.append("tags", tags);
    formData.append("applicationNames", selectedApplications.join(", "));
    formData.append("documentCategory", documentCategory);
    formData.append("programmingLanguages", programmingLanguages.join(", "));
    formData.append("source", source);
    setActivityItems((previous) => [...pendingItems, ...previous]);

    try {
      setIsIndexing(true);
      setIndexingError("");
      setIndexingMessage("");
      setProcessingPhase({
        label: "Text extraction",
        detail: `${files.length} file(s) received. Extracting text from PDF/DOCX content.`,
      });
      setActivityItems((previous) => advanceBatch(previous, pendingItems, "parsing", 35));

      await waitForUiFrame();
      setProcessingPhase({
        label: "Search indexing",
        detail: "Text extracted. Sending structured records to Meilisearch.",
      });
      setActivityItems((previous) => advanceBatch(previous, pendingItems, "indexing", 82));

      const response = await indexDocuments(formData);

      setActivityItems((previous) =>
        previous.map((item) => {
          const pendingIndex = pendingItems.findIndex((pending) => pending.id === item.id);

          if (pendingIndex === -1) {
            return item;
          }

          const matched = response.documents[pendingIndex];

          return {
            ...item,
            id: matched?.id ?? item.id,
            title: matched?.title ?? item.title,
            fileName: matched?.fileName ?? item.fileName,
            contentLength: matched?.contentLength ?? item.contentLength,
            status: "indexed",
            progress: 100,
          };
        }),
      );

      setFiles([]);
      setTags("");
      setSelectedApplications([applications[0] ?? defaultApplications[0]]);
      setProgrammingLanguages([]);
      setProcessingPhase({
        label: "Complete",
        detail: `${response.indexedCount} document(s) are searchable now.`,
      });
      setIndexingMessage(`${response.indexedCount} document(s) indexed successfully.`);
      await loadHealth();
      await loadDocuments();
    } catch (error) {
      setActivityItems((previous) =>
        previous.map((item) => (pendingItems.some((pending) => pending.id === item.id) ? { ...item, status: "failed", progress: 100 } : item)),
      );
      setProcessingPhase({
        label: "Failed",
        detail: "Indexing stopped before completion. Check the error message below.",
      });
      setIndexingError(error instanceof Error ? error.message : "Indexing failed.");
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSearch(query);
  }

  function addSelectedFiles(candidateFiles: File[]) {
    const supportedFiles = candidateFiles.filter(isSupportedUpload);

    if (supportedFiles.length === 0) {
      setIndexingError("Only PDF and DOCX files are supported in this POC.");
      return;
    }

    if (supportedFiles.length > 1) {
      setIndexingError("Upload one file at a time. The metadata applies to a single document.");
    }

    if (supportedFiles.length === 1) {
      setIndexingError("");
    }
    const nextFiles = [supportedFiles[0]];
    setProcessingPhase({
      label: "Ready",
      detail: `${nextFiles[0].name} is ready for indexing.`,
    });
    setFiles(nextFiles);
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    addSelectedFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDropzoneDragEnter(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }

  function handleDropzoneDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDropzoneDragLeave(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  }

  function handleDropzoneDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    addSelectedFiles(Array.from(event.dataTransfer.files ?? []));
  }

  async function runSearch(rawQuery: string) {
    if (!rawQuery.trim()) {
      setSearchError("Enter a keyword or phrase to search.");
      return;
    }

    try {
      setIsSearching(true);
      setSearchError("");
      setSelectedResult(null);
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

  function addApplication() {
    const normalized = newApplicationName.trim();

    if (!normalized) {
      return;
    }

    setApplications((previous) => {
      const next = previous.includes(normalized) ? previous : [...previous, normalized].sort((left, right) => left.localeCompare(right));
      return next;
    });
    setSelectedApplications((previous) => (previous.includes(normalized) ? previous : [...previous, normalized]));
    setNewApplicationName("");
  }

  function openResult(hit: SearchHit) {
    setSelectedResult(hit);
    setReaderNotice("");
  }

  async function handleOpenDesktopApp() {
    if (!selectedResult) {
      return;
    }

    try {
      setIsOpeningDesktopApp(true);
      setReaderNotice("");
      await openDocumentInDesktopApp(selectedResult.id);
      setReaderNotice("Opened in the desktop app. Saved changes are watched and reindexed automatically.");
    } catch (error) {
      setReaderNotice(error instanceof Error ? error.message : "Unable to open the original file in the desktop app.");
    } finally {
      setIsOpeningDesktopApp(false);
    }
  }

  const selectedMatchCount = selectedResult ? countMatches(selectedResult.content, query) : 0;
  const selectedPreviewUrl = selectedResult ? toApiUrl(selectedResult.previewFileUrl) : "";
  const selectedOriginalUrl = selectedResult ? toApiUrl(selectedResult.originalFileUrl) : "";

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">Rossignol IT KnowledgeDB</div>
          <p>Internal search workspace</p>
        </div>

        <nav className="sidebar-nav">
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
                  A refined engine for high-velocity technical search. Index and query PDF/DOCX content with a clean
                  ingestion flow and full-text retrieval.
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
                    <p className="queue-phase">{processingPhase.label}: {processingPhase.detail}</p>
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
                      <div className="empty-line">No indexed documents yet. Upload PDF or DOCX files to populate the repository.</div>
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
                  placeholder="Search full text across indexed documents"
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
                  {isSearching ? (
                    <div className="loading-card">
                      <span className="loading-ring" />
                      <div>
                        <strong>Searching indexed text</strong>
                        <p>Scanning titles, metadata, and extracted document text.</p>
                      </div>
                    </div>
                  ) : null}
                  {searchError ? <div className="message-card error">{searchError}</div> : null}
                  {!isSearching && filteredResults.length === 0 ? (
                    <div className="result-card empty-card">
                      <h3>No results yet</h3>
                      <p>Run a query after indexing a few documents. Filters are applied client-side on the current result set.</p>
                    </div>
                  ) : (
                    filteredResults.map((hit) => (
                      <article
                        className="result-card interactive"
                        key={hit.id}
                        onClick={() => openResult(hit)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openResult(hit);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="result-card-top">
                          <div>
                            <div className="result-tag-row">
                              <span className="tone-tag">{hit.documentType.toUpperCase()}</span>
                              {hit.applicationNames.map((application) => (
                                <span className={metadataPillClass("application")} key={`${hit.id}-${application}`}>
                                  {application}
                                </span>
                              ))}
                              {hit.documentCategory ? (
                                <span className={metadataPillClass("category")}>{formatCategoryLabel(hit.documentCategory)}</span>
                              ) : null}
                              {hit.programmingLanguages.map((language) => (
                                <span className={metadataPillClass("language")} key={`${hit.id}-${language}`}>
                                  {language}
                                </span>
                              ))}
                              <span className="result-ref">Ref: {hit.id.slice(0, 8)}</span>
                            </div>
                            <h3>{hit.title}</h3>
                          </div>
                          <span className="open-text-label">
                            <BookOpen size={16} />
                            Open text
                          </span>
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
                    <label
                      className={isDraggingFiles ? "dropzone-surface is-dragging" : "dropzone-surface"}
                      onDragEnter={handleDropzoneDragEnter}
                      onDragLeave={handleDropzoneDragLeave}
                      onDragOver={handleDropzoneDragOver}
                      onDrop={handleDropzoneDrop}
                    >
                      <input
                        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                        onChange={handleFileInputChange}
                        type="file"
                      />
                      <div className="dropzone-icon">
                        <Upload size={28} />
                      </div>
                      <h3>Drag and drop documents</h3>
                      <p>
                        or <span>browse your local files</span>
                      </p>
                      <small>MAX 50MB - PDF, DOCX</small>
                    </label>

                    <div className="dropzone-meta">
                      <div className="meta-field">
                        <span>Selected files</span>
                        <strong>{selectedFilesLabel}</strong>
                      </div>
                      <div className="meta-field">
                        <span>Processing phase</span>
                        <strong>{processingPhase.label}</strong>
                        <small>{processingPhase.detail}</small>
                      </div>
                      <div className="meta-field">
                        <span>Applications</span>
                        <strong>{selectedApplications.length > 0 ? selectedApplications.join(", ") : "No app selected"}</strong>
                        <small>Select one or more application scopes below.</small>
                      </div>
                      <div className="meta-field">
                        <span>Accepted types</span>
                        <strong>PDF, DOCX</strong>
                        <small>Type is detected automatically per file.</small>
                      </div>
                    </div>

                    <div className="metadata-grid">
                      <div className="tag-panel">
                        <div className="card-header">
                          <h3>Application binding</h3>
                        </div>
                        <div className="application-create">
                          <input
                            onChange={(event) => setNewApplicationName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addApplication();
                              }
                            }}
                            placeholder="Add a new application code"
                            type="text"
                            value={newApplicationName}
                          />
                          <button className="ghost-button" onClick={addApplication} type="button">
                            <Plus size={16} />
                            Add app
                          </button>
                        </div>
                        <div className="application-pill-list">
                          {applications.map((application) => (
                            <button
                              className={selectedApplications.includes(application) ? "choice-pill active" : "choice-pill"}
                              key={application}
                              onClick={() => toggleSelection(application, setSelectedApplications)}
                              type="button"
                            >
                              {application}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="tag-panel">
                        <div className="card-header">
                          <h3>Document classification</h3>
                        </div>
                        <div className="choice-pill-list">
                          {documentCategoryOptions.map((option) => (
                            <button
                              className={documentCategory === option.value ? "choice-pill active" : "choice-pill"}
                              key={option.value}
                              onClick={() => setDocumentCategory(option.value)}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="tag-panel">
                      <div className="card-header">
                        <h3>Programming languages</h3>
                      </div>
                      <div className="language-grid">
                        {programmingLanguageOptions.map((language) => (
                          <label className="check-row compact" key={language}>
                            <input
                              checked={programmingLanguages.includes(language)}
                              onChange={() => toggleSelection(language, setProgrammingLanguages)}
                              type="checkbox"
                            />
                            <span>{language}</span>
                          </label>
                        ))}
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

                    <div className="tag-panel metadata-summary">
                      <div className="card-header">
                        <h3>Indexing profile</h3>
                      </div>
                      <div className="summary-chip-list">
                        {selectedApplications.length > 0 ? (
                          selectedApplications.map((application) => (
                            <span className={metadataPillClass("application")} key={application}>
                              {application}
                            </span>
                          ))
                        ) : (
                          <span className="tag-placeholder">No application selected</span>
                        )}
                        <span className={metadataPillClass("category")}>{formatCategoryLabel(documentCategory)}</span>
                        {programmingLanguages.length > 0 ? (
                          programmingLanguages.map((language) => (
                            <span className={metadataPillClass("language")} key={language}>
                              <Braces size={12} />
                              {language}
                            </span>
                          ))
                        ) : (
                          <span className="tag-placeholder">No language selected</span>
                        )}
                      </div>
                      <div className="source-row">
                        <span>Source</span>
                        <input onChange={(event) => setSource(event.target.value)} type="text" value={source} />
                      </div>
                    </div>

                    <div className="dropzone-actions">
                      <button className="primary-button" disabled={isIndexing} type="submit">
                        {isIndexing ? <LoaderCircle className="spin" size={16} /> : <FileSearch size={16} />}
                        {isIndexing ? "Indexing..." : "Index file"}
                      </button>
                    </div>

                    {isIndexing ? (
                      <div className="loading-card compact">
                        <span className="loading-ring" />
                        <div>
                          <strong>{processingPhase.label}</strong>
                          <p>{processingPhase.detail}</p>
                        </div>
                      </div>
                    ) : null}

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
                                {item.sizeLabel} - {item.typeLabel.toUpperCase()}
                              </span>
                            </div>
                            <div className="activity-tags">
                              <span className={`status-token status-${item.status}`}>{statusLabel(item.status)}</span>
                              {item.applicationNames.map((application) => (
                                <span className={metadataPillClass("application")} key={`${item.id}-${application}`}>
                                  {application}
                                </span>
                              ))}
                              <span className={metadataPillClass("category")}>{formatCategoryLabel(item.documentCategory)}</span>
                              {item.programmingLanguages.map((language) => (
                                <span className={metadataPillClass("language")} key={`${item.id}-${language}`}>
                                  {language}
                                </span>
                              ))}
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
                              <span>{item.status === "indexed" ? <CheckCircle2 size={16} /> : item.status === "failed" ? <Database size={16} /> : <Clock3 size={16} />}</span>
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
                    <div
                      className={isIndexing ? "ring-shell is-processing" : "ring-shell"}
                      style={{ ["--ring-angle" as string]: `${Math.round(queueProgress * 3.6)}` }}
                    >
                      <div className="ring-core">
                        <strong>{queueProgress}%</strong>
                        <span>Processed</span>
                      </div>
                    </div>
                  </div>

                  <div className="queue-bars">
                    <div>
                      <div className="queue-labels">
                        <span>Text extraction</span>
                        <strong>{parsedCount} / {totalDocuments}</strong>
                      </div>
                      <div className="progress-track slim">
                        <span style={{ width: `${totalDocuments === 0 ? 0 : (parsedCount / totalDocuments) * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="queue-labels">
                        <span>Search indexing</span>
                        <strong>{indexedCount} / {totalDocuments}</strong>
                      </div>
                      <div className="progress-track slim">
                        <span style={{ width: `${totalDocuments === 0 ? 0 : (indexedCount / totalDocuments) * 100}%` }} />
                      </div>
                    </div>
                    {failedCount > 0 ? (
                      <div className="queue-error">
                        {failedCount} failed item(s)
                      </div>
                    ) : null}
                  </div>

                  <button className="ghost-button full-width" onClick={() => setActiveView("search")} type="button">
                    Open search
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

        {selectedResult ? (
          <section className="document-reader" aria-label="Document text reader">
            <div className="reader-backdrop" onClick={() => setSelectedResult(null)} />
            <article className="reader-panel">
              <header className="reader-header">
                <div className="reader-title-block">
                  <div className="reader-title-icon">
                    <FileText size={22} />
                  </div>
                  <div>
                    <div className="result-tag-row">
                      <span className="tone-tag">{selectedResult.documentType.toUpperCase()}</span>
                      <span className="result-ref">Ref: {selectedResult.id.slice(0, 8)}</span>
                    </div>
                    <h2>{selectedResult.title}</h2>
                    <p>{selectedResult.fileName}</p>
                  </div>
                </div>
                <button aria-label="Close document reader" className="icon-button" onClick={() => setSelectedResult(null)} type="button">
                  <X size={20} />
                </button>
              </header>

              <div className="reader-toolbar">
                <div className="reader-toolbar-meta">
                  <div className="reader-query">
                    <Search size={16} />
                    <span>{query ? `Current query: "${query}"` : "No active query"}</span>
                  </div>
                  <div className="reader-stat">
                    <strong>{selectedMatchCount}</strong>
                    <span>{selectedMatchCount === 1 ? "match" : "matches"}</span>
                  </div>
                </div>
              </div>

              <div className="reader-content-shell">
                <main className="reader-document">
                  {selectedPreviewUrl ? (
                    <iframe className="original-frame" src={selectedPreviewUrl} title={`Original preview for ${selectedResult.fileName}`} />
                  ) : (
                    <div className="original-unavailable">
                      <FileText size={34} />
                      <h3>Original file not stored for this result</h3>
                      <p>
                        This document was indexed before original-file storage was added. Reupload it from Ingestion and the
                        original preview will open here.
                      </p>
                      <button className="primary-button" onClick={() => setActiveView("ingestion")} type="button">
                        <Upload size={16} />
                        Reupload file
                      </button>
                    </div>
                  )}
                </main>

                <aside className="reader-sidepanel">
                  <div>
                    <span>Preview mode</span>
                    <strong>{selectedPreviewUrl ? "Original file" : "Unavailable"}</strong>
                  </div>
                  <div>
                    <span>Uploaded</span>
                    <strong>{new Date(selectedResult.uploadedAt).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Applications</span>
                    <div className="reader-tag-list">
                      {selectedResult.applicationNames.length > 0 ? (
                        selectedResult.applicationNames.map((application) => (
                          <span className={metadataPillClass("application")} key={`${selectedResult.id}-${application}`}>
                            {application}
                          </span>
                        ))
                      ) : (
                        <strong>Unassigned</strong>
                      )}
                    </div>
                  </div>
                  <div>
                    <span>Document class</span>
                    <strong>{formatCategoryLabel(selectedResult.documentCategory ?? "general-reference")}</strong>
                  </div>
                  <div>
                    <span>Source</span>
                    <strong>{selectedResult.source}</strong>
                  </div>
                  <div>
                    <span>Characters</span>
                    <strong>{formatCount(selectedResult.content.length)}</strong>
                  </div>
                  <div>
                    <span>Languages</span>
                    <div className="reader-tag-list">
                      {selectedResult.programmingLanguages.length > 0 ? (
                        selectedResult.programmingLanguages.map((language) => (
                          <span className={metadataPillClass("language")} key={`${selectedResult.id}-${language}`}>
                            {language}
                          </span>
                        ))
                      ) : (
                        <strong>No language tags</strong>
                      )}
                    </div>
                  </div>
                  {selectedOriginalUrl ? (
                    <button className="reader-action-button" disabled={isOpeningDesktopApp} onClick={() => void handleOpenDesktopApp()} type="button">
                      {isOpeningDesktopApp ? "Opening..." : "Open in desktop app"}
                    </button>
                  ) : null}
                  {selectedOriginalUrl ? (
                    <a className="reader-file-link" href={selectedOriginalUrl} target="_blank" rel="noreferrer">
                      Open in new tab
                    </a>
                  ) : null}
                  {readerNotice ? <p className="reader-notice">{readerNotice}</p> : null}
                  <div>
                    <span>Tags</span>
                    <div className="reader-tag-list">
                      {selectedResult.tags.length > 0 ? (
                        selectedResult.tags.map((tag) => (
                          <span className="doc-pill" key={`${selectedResult.id}-${tag}`}>
                            {tag}
                          </span>
                        ))
                      ) : (
                        <strong>No tags</strong>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </article>
          </section>
        ) : null}
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
  return highlightText(snippet, query);
}

function highlightText(text: string, query: string) {
  if (!query.trim()) {
    return text;
  }

  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return text;
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const pieces = text.split(pattern);

  return pieces.map((piece, index) =>
    terms.some((term) => piece.toLowerCase() === term.toLowerCase()) ? (
      <mark key={`${piece}-${index}`}>{piece}</mark>
    ) : (
      <span key={`${piece}-${index}`}>{piece}</span>
    ),
  );
}

function countMatches(text: string, query: string): number {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return 0;
  }

  const pattern = new RegExp(terms.map(escapeRegExp).join("|"), "gi");
  return text.match(pattern)?.length ?? 0;
}

function cleanupExtractedText(content: string): string {
  return content
    .replace(/\s+/g, " ")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-zÀ-ÖØ-öø-ÿ])/g, "$1 $2")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])([^\s])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitLongParagraph(paragraph: string): string[] {
  const parts: string[] = [];

  for (let start = 0; start < paragraph.length; start += 420) {
    const end = Math.min(paragraph.length, start + 520);
    const slice = paragraph.slice(start, end);
    const lastSpace = slice.lastIndexOf(" ");

    if (end < paragraph.length && lastSpace > 240) {
      parts.push(slice.slice(0, lastSpace).trim());
      start += lastSpace - 420;
    } else {
      parts.push(slice.trim());
    }
  }

  return parts.filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

void cleanupExtractedText;
void splitLongParagraph;

function createPendingActivity(
  file: File,
  tags: string[],
  source: string,
  applicationNames: string[],
  documentCategory: string,
  programmingLanguages: string[],
  batchId: string,
  index: number,
): ActivityItem {
  const documentType = documentTypeFromFile(file.name);

  return {
    id: `pending-${batchId}-${index}`,
    title: file.name.replace(/\.(pdf|docx)$/i, ""),
    fileName: file.name,
    contentLength: 0,
    sizeLabel: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
    typeLabel: documentType,
    tags,
    status: "queued",
    progress: 8,
    uploadedAt: new Date().toISOString(),
    source,
    applicationNames,
    documentCategory,
    programmingLanguages,
  };
}

function isSupportedUpload(file: File): boolean {
  return documentTypeFromFile(file.name) !== "file";
}

function documentTypeFromFile(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "pdf" || extension === "docx") {
    return extension;
  }

  return "file";
}

function advanceBatch(
  items: ActivityItem[],
  pendingItems: ActivityItem[],
  status: ActivityItem["status"],
  progress: number,
): ActivityItem[] {
  const pendingIds = new Set(pendingItems.map((item) => item.id));

  return items.map((item) => (pendingIds.has(item.id) ? { ...item, status, progress } : item));
}

function statusLabel(status: ActivityItem["status"]): string {
  if (status === "queued") {
    return "Queued";
  }

  if (status === "parsing") {
    return "Parsing";
  }

  if (status === "indexing") {
    return "Indexing";
  }

  if (status === "indexed") {
    return "Complete";
  }

  return "Failed";
}

function estimatePages(item: ActivityItem): number {
  if (item.contentLength > 0) {
    return Math.max(1, Math.round(item.contentLength / 2500));
  }

  return Math.max(1, Math.round(Number(item.sizeLabel.replace(/[^\d.]/g, "")) * 12));
}

function documentToActivity(document: DocumentSummary): ActivityItem {
  return {
    id: document.id,
    title: document.title,
    fileName: document.fileName,
    contentLength: document.contentLength,
    sizeLabel: `${Math.max(0.1, document.contentLength / (1024 * 1024)).toFixed(1)} MB`,
    typeLabel: document.documentType,
    tags: document.tags,
    status: "indexed",
    progress: 100,
    uploadedAt: document.uploadedAt,
    source: document.source,
    applicationNames: document.applicationNames ?? [],
    documentCategory: document.documentCategory ?? "general-reference",
    programmingLanguages: document.programmingLanguages ?? [],
  };
}

function formatCategoryLabel(value: string): string {
  const option = documentCategoryOptions.find((entry) => entry.value === value);
  return option?.label ?? value.replace(/-/g, " ");
}

function metadataPillClass(kind: "application" | "category" | "language"): string {
  return `doc-pill metadata-pill ${kind}-pill`;
}

function loadStoredApplications(): string[] {
  if (typeof window === "undefined") {
    return defaultApplications;
  }

  const storedApplications = window.localStorage.getItem(applicationStorageKey);

  if (!storedApplications) {
    return defaultApplications;
  }

  try {
    const parsed = JSON.parse(storedApplications) as string[];
    const sanitized = Array.from(new Set(parsed.map((entry) => entry.trim()).filter(Boolean)));
    return sanitized.length > 0 ? sanitized : defaultApplications;
  } catch {
    return defaultApplications;
  }
}

function waitForUiFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 120);
  });
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
  if (view === "search") {
    return "Knowledge Search";
  }

  return "Document Ingestion";
}

export default App;
