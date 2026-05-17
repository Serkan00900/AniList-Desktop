const GRAPHQL_API_URL = 'https://graphql.anilist.co';
const OAUTH_CLIENT_ID = 41619;
const DEFAULT_THEME = 'mirage';

let ACTIVE_SESSION_TOKEN = null;
let CACHED_USER_ID = null;
let CURRENTLY_OPENED_MEDIA_ID = null;

function $id(id) {
  return document.getElementById(id);
}

function attachIfFound(id, eventName, handler) {
  const node = $id(id);
  if (node) node.addEventListener(eventName, handler);
}

window.addEventListener('DOMContentLoaded', async () => {
  setupAppWindowActionControls();
  setupAppNavigationRoutingTabs();
  setupAppearanceThemesEngine();
  setupAdSensePreferenceEngine();

  attachIfFound('get-pin-btn', 'click', () => {
    const authDest = `https://anilist.co/api/v2/oauth/authorize?client_id=${OAUTH_CLIENT_ID}&response_type=token`;
    window.electronAPI.openExternal(authDest);
    renderBannerMessage('login-status', 'Browser opened. Paste the returned access token below.', '#3db4f2');
  });

  attachIfFound('submit-login-btn', 'click', async () => {
    const pin = $id('pin-input')?.value.trim();
    if (!pin) return renderBannerMessage('login-status', 'Please provide a valid token string.', '#ff4a4a');

    ACTIVE_SESSION_TOKEN = pin;
    renderBannerMessage('login-status', 'Validating access parameters...', '#3db4f2');

    if (await verifyUser()) {
      const saveResult = await window.electronAPI.saveToken({ token: ACTIVE_SESSION_TOKEN });
      if (saveResult?.success) {
        displayDashboardViewPanel();
      } else {
        ACTIVE_SESSION_TOKEN = null;
        renderBannerMessage('login-status', 'Unable to save token. Please try again.', '#ff4a4a');
      }
    } else {
      ACTIVE_SESSION_TOKEN = null;
      renderBannerMessage('login-status', 'Invalid token. Please verify the value and try again.', '#ff4a4a');
    }
  });

  attachIfFound('logout-btn', 'click', async () => {
    await window.electronAPI.deleteToken();
    ACTIVE_SESSION_TOKEN = null;
    CACHED_USER_ID = null;
    displayLoginIdentityPanel();
  });

  attachIfFound('search-engine-btn', 'click', executeGlobalDatabaseSearch);
  attachIfFound('search-engine-input', 'keypress', (e) => { if (e.key === 'Enter') executeGlobalDatabaseSearch(); });

  const loadedPayload = await window.electronAPI.loadToken();
  if (loadedPayload?.token) {
    ACTIVE_SESSION_TOKEN = loadedPayload.token;
    displayDashboardViewPanel();
  } else {
    displayLoginIdentityPanel();
  }
});

/* --- DEV FRAME SYSTEMS FRAME MANAGEMENT --- */
function setupAppWindowActionControls() {
  attachIfFound('ctrl-min-btn', 'click', () => window.electronAPI.minimizeWindow());
  attachIfFound('ctrl-max-btn', 'click', () => window.electronAPI.maximizeWindow());
  attachIfFound('ctrl-close-btn', 'click', () => window.electronAPI.closeWindow());
  attachIfFound('modal-close-btn', 'click', () => {
    const modal = $id('media-details-modal');
    if (modal) modal.style.display = 'none';
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const modal = $id('media-details-modal');
      if (modal) modal.style.display = 'none';
    }
  });
}

function setupAppearanceThemesEngine() {
  const activeSavedTheme = localStorage.getItem('user-selected-theme') || 'mirage';
  document.documentElement.setAttribute('data-theme', activeSavedTheme);

  const themeBoxes = document.querySelectorAll('.theme-option-box');
  themeBoxes.forEach(box => {
    box.addEventListener('click', () => {
      const selected = box.getAttribute('data-theme-set');
      document.documentElement.setAttribute('data-theme', selected);
      localStorage.setItem('user-selected-theme', selected);
    });
  });
}

/* --- GOOGLE ADSENSE RUNTIME CONTROLLER ENGINE --- */
function setupAdSensePreferenceEngine() {
  const adDisableToggle = $id('ad-disable-toggle-input');
  if (!adDisableToggle) return;

  const adsAreDisabled = localStorage.getItem('user-disable-ads') === 'true';
  adDisableToggle.checked = adsAreDisabled;
  evaluateAdDisplayState(adsAreDisabled);

  adDisableToggle.addEventListener('change', (e) => {
    const shouldDisable = e.target.checked;
    localStorage.setItem('user-disable-ads', shouldDisable ? 'true' : 'false');
    evaluateAdDisplayState(shouldDisable);
  });
}

function evaluateAdDisplayState(disableAds) {
  const adWrapper = document.getElementById('app-adsense-banner-wrapper');
  const coreScriptElement = document.getElementById('adsense-core-script');

  if (disableAds) {
    adWrapper.style.display = 'none';
    if (coreScriptElement) {
      coreScriptElement.setAttribute('src', '');
    }
  } else {
    adWrapper.style.display = 'block';
    if (coreScriptElement && !coreScriptElement.getAttribute('src')) {
      coreScriptElement.setAttribute('src', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6874084132650870');
    }
    // Fire AdSense tracking hook arrays refresh pipeline if script operational 
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // Catch native internal setup duplicates mutations cleanly
    }
  }
}

/* --- VIEW ROUTING CONTROL INFRASTRUCTURE --- */
function displayLoginIdentityPanel() {
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('search-view').style.display = 'none';
  document.getElementById('main-themes-content-node').style.display = 'none';
  document.getElementById('login-view').style.display = 'flex';
}

async function displayDashboardViewPanel() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('search-view').style.display = 'none';
  document.getElementById('main-themes-content-node').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  
  document.getElementById('view-loading-overlay').style.display = 'flex';
  document.getElementById('subview-overview').style.display = 'none';
  
  await syncRenderCloudDataMetrics();
}

function setupAppNavigationRoutingTabs() {
  const profileTab = document.getElementById('nav-profile-tab');
  const discoverTab = document.getElementById('nav-discover-tab');
  const searchTab = document.getElementById('nav-search-tab');
  const themesTab = document.getElementById('nav-themes-tab');
  
  const dashboardNode = document.getElementById('dashboard-view');
  const discoverNode = document.getElementById('discover-view');
  const searchNode = document.getElementById('search-view');
  const themesNode = document.getElementById('main-themes-content-node');

  profileTab.addEventListener('click', () => {
    profileTab.classList.add('active'); discoverTab.classList.remove('active'); searchTab.classList.remove('active'); themesTab.classList.remove('active');
    dashboardNode.style.display = 'block'; discoverNode.style.display = 'none'; searchNode.style.display = 'none'; themesNode.style.display = 'none';
  });

  discoverTab.addEventListener('click', async () => {
    discoverTab.classList.add('active'); profileTab.classList.remove('active'); searchTab.classList.remove('active'); themesTab.classList.remove('active');
    discoverNode.style.display = 'block'; dashboardNode.style.display = 'none'; searchNode.style.display = 'none'; themesNode.style.display = 'none';
    await loadDiscoverContent();
    
    // Setup filter change listeners
    const sortSelect = document.getElementById('discover-sort');
    const genreSelect = document.getElementById('discover-genre');
    const typeSelect = document.getElementById('discover-type');
    
    [sortSelect, genreSelect, typeSelect].forEach(select => {
      if (select && !select._listenerAttached) {
        select.addEventListener('change', () => loadDiscoverContent(true));
        select._listenerAttached = true;
      }
    });
  });

  searchTab.addEventListener('click', () => {
    searchTab.classList.add('active'); profileTab.classList.remove('active'); discoverTab.classList.remove('active'); themesTab.classList.remove('active');
    searchNode.style.display = 'flex'; dashboardNode.style.display = 'none'; discoverNode.style.display = 'none'; themesNode.style.display = 'none';
  });

  themesTab.addEventListener('click', () => {
    themesTab.classList.add('active'); profileTab.classList.remove('active'); discoverTab.classList.remove('active'); searchTab.classList.remove('active');
    themesNode.style.display = 'block'; dashboardNode.style.display = 'none'; discoverNode.style.display = 'none'; searchNode.style.display = 'none';
  });

  const subOverview = document.getElementById('subnav-overview');
  const subAnime = document.getElementById('subnav-animelist');
  const subManga = document.getElementById('subnav-mangalist');

  const viewOverview = document.getElementById('subview-overview');
  const viewAnime = document.getElementById('subview-animelist');
  const viewManga = document.getElementById('subview-mangalist');

  subOverview.addEventListener('click', () => {
    subOverview.classList.add('active'); subAnime.classList.remove('active'); subManga.classList.remove('active');
    viewOverview.style.display = 'grid'; viewAnime.style.display = 'none'; viewManga.style.display = 'none';
  });

  subAnime.addEventListener('click', async () => {
    subAnime.classList.add('active'); subOverview.classList.remove('active'); subManga.classList.remove('active');
    viewAnime.style.display = 'block'; viewOverview.style.display = 'none'; viewManga.style.display = 'none';
    if(CACHED_USER_ID) await fetchAndRenderUserList(CACHED_USER_ID, 'ANIME', 'anime-grid-node');
  });

  subManga.addEventListener('click', async () => {
    subManga.classList.add('active'); subOverview.classList.remove('active'); subAnime.classList.remove('active');
    viewManga.style.display = 'block'; viewOverview.style.display = 'none'; viewAnime.style.display = 'none';
    if(CACHED_USER_ID) await fetchAndRenderUserList(CACHED_USER_ID, 'MANGA', 'manga-grid-node');
  });
}

/* --- AUTH PIN HANDSHAKING LOGISTICS --- */
async function verifyUser() {
  try {
    const res = await fetch(GRAPHQL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ACTIVE_SESSION_TOKEN },
      body: JSON.stringify({ query: `query { Viewer { id } }` })
    });
    const json = await res.json();
    return json.data && json.data.Viewer ? true : false;
  } catch(e) { return false; }
}

/* --- DISCOVER TAB STATE MANAGEMENT --- */
let DISCOVER_PAGE = 1;
let DISCOVER_IS_LOADING = false;
let DISCOVER_HAS_MORE = true;

/* --- DISCOVER TAB TRENDING CONTENT LOADER --- */
async function loadDiscoverContent(reset = true) {
  if (reset) {
    DISCOVER_PAGE = 1;
    DISCOVER_HAS_MORE = true;
    document.getElementById('discover-results-grid').innerHTML = '';
  }
  
  const sort = document.getElementById('discover-sort')?.value || 'TRENDING_DESC';
  const genre = document.getElementById('discover-genre')?.value || null;
  const type = document.getElementById('discover-type')?.value || 'ANIME';
  
  await fetchDiscoverPage(sort, genre, type);
  setupDiscoverScrollListener();
}

async function fetchDiscoverPage(sort, genre, type) {
  if (DISCOVER_IS_LOADING || !DISCOVER_HAS_MORE) return;
  DISCOVER_IS_LOADING = true;
  
  const genreFilter = genre ? `genre: "${genre}"` : '';
  const query = `
    query {
      Page(page: ${DISCOVER_PAGE}, perPage: 20) {
        media(sort: ${sort}, type: ${type} ${genreFilter}) {
          id title { romaji } coverImage { large } format averageScore description
        }
        pageInfo { hasNextPage }
      }
    }
  `;

  try {
    const res = await fetch(GRAPHQL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);

    const media = json.data.Page.media;
    const hasNext = json.data.Page.pageInfo.hasNextPage;
    DISCOVER_HAS_MORE = hasNext;
    
    const grid = document.getElementById('discover-results-grid');
    const emptyState = document.getElementById('discover-empty-state');
    
    if (DISCOVER_PAGE === 1) {
      grid.innerHTML = '';
      emptyState.style.display = 'none';
    }
    
    media.forEach(item => {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.innerHTML = `
        <img src="${item.coverImage.large}" alt="${item.title.romaji}" style="width:100%; height:190px; object-fit:cover; background-color:var(--bg-main);">
        <div class="media-card-title">${item.title.romaji}</div>
        <div class="media-card-badges">
          <span class="badge-status">${item.format || 'N/A'}</span>
          <span class="badge-score">${item.averageScore ? item.averageScore + '%' : 'N/A'}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        const modal = $id('media-details-modal');
        if (modal) {
          document.getElementById('modal-img').src = item.coverImage.large;
          document.getElementById('modal-title').innerText = item.title.romaji;
          document.getElementById('modal-meta').innerText = `${item.format} • ${item.averageScore || 'N/A'}% Score`;
          document.getElementById('modal-desc').innerText = item.description || 'No description available.';
          modal.style.display = 'flex';
        }
      });
      grid.appendChild(card);
    });
    
    DISCOVER_PAGE++;
  } catch(e) {
    console.error(e);
    if (DISCOVER_PAGE === 1) {
      document.getElementById('discover-empty-state').innerText = 'Failed to load content.';
      document.getElementById('discover-empty-state').style.display = 'block';
    }
  } finally {
    DISCOVER_IS_LOADING = false;
  }
}

function setupDiscoverScrollListener() {
  const scroller = document.querySelector('.app-main-content-scroller');
  if (!scroller._discoverListenerAttached) {
    scroller.addEventListener('scroll', () => {
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 300) {
        const sort = document.getElementById('discover-sort')?.value || 'TRENDING_DESC';
        const genre = document.getElementById('discover-genre')?.value || null;
        const type = document.getElementById('discover-type')?.value || 'ANIME';
        fetchDiscoverPage(sort, genre, type);
      }
    });
    scroller._discoverListenerAttached = true;
  }
}

/* --- COMPREHENSIVE OVERVIEW METRICS SYNCHRONIZER ENGINE --- */
async function syncRenderCloudDataMetrics() {
  const coreUserQuery = `
    query {
      Viewer {
        id name bannerImage avatar { large }
        favourites {
          anime {
            nodes { id title { romaji } coverImage { large } format averageScore description }
          }
          manga {
            nodes { id title { romaji } coverImage { large } format averageScore description }
          }
        }
      }
    }
  `;

  try {
    const coreRes = await fetch(GRAPHQL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ACTIVE_SESSION_TOKEN },
      body: JSON.stringify({ query: coreUserQuery })
    });
    
    const parsedCore = await coreRes.json();
    if (parsedCore.errors) throw new Error(parsedCore.errors[0].message);

    const user = parsedCore.data.Viewer;
    CACHED_USER_ID = user.id;

    document.getElementById('user-cover-banner').style.backgroundImage = `url('${user.bannerImage || 'https://anilist.co/img/icons/banner.png'}')`;
    document.getElementById('user-avatar-element').src = user.avatar?.large || '';
    document.getElementById('user-display-name').innerText = user.name || 'User Profile';

    // Advanced User Analytics Framework Query (Pulls History Activity Maps)
    const dataHubQuery = `
      query($id: Int) {
        User(id: $id) {
          statistics {
            anime { count minutesWatched genres(limit: 5, sort: COUNT_DESC) { genre count } }
            manga { chaptersRead }
          }
        }
        Page(page: 1, perPage: 15) {
          activities(userId: $id, sort: ID_DESC) {
            ... on ListActivity {
              id type status progress createdAt
              media { title { romaji } coverImage { large } }
            }
          }
        }
      }
    `;

    const hubRes = await fetch(GRAPHQL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: dataHubQuery, variables: { id: CACHED_USER_ID } })
    });

    const parsedHub = await hubRes.json();
    const statsObj = parsedHub.data?.User?.statistics;
    const activityLogs = parsedHub.data?.Page?.activities || [];

    // Parse out data block mappings
    const totalAnime = statsObj?.anime?.count || 0;
    const minutesWatched = statsObj?.anime?.minutesWatched || 0;
    const chaptersRead = statsObj?.manga?.chaptersRead || 0;

    document.getElementById('metric-anime-total').innerText = totalAnime;
    document.getElementById('metric-anime-days').innerText = (minutesWatched / 1440).toFixed(1);
    document.getElementById('metric-manga-chapters').innerText = chaptersRead;

    // Render components safely
    const genreArray = (statsObj?.anime?.genres || []).map(g => ({ genre: g.genre, amount: g.count }));
    buildGenreTrackBars(genreArray);
    buildActivityStreamLogs(activityLogs);
    buildFavoritedAnimeSection(user.favourites?.anime?.nodes || []);
    buildFavoritedMangaSection(user.favourites?.manga?.nodes || []);

    document.getElementById('view-loading-overlay').style.display = 'none';
    document.getElementById('subview-overview').style.display = 'grid';

  } catch(err) {
    console.error("Dashboard Analytics Framework Sync Failure Intercept:", err);
    document.getElementById('view-loading-overlay').innerHTML = `
      <div style="text-align: center; color: #ff4a4a; padding: 20px;">
        <p>Failed to build structural dashboard frames maps layer pipelines.</p>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 15px;">Reason: ${err.message}</p>
        <button onclick="document.getElementById('logout-btn').click()">Reset Token Session</button>
      </div>
    `;
  }
}

function buildGenreTrackBars(genres) {
  const labelsContainer = document.getElementById('genre-overview-container');
  const trackBarNode = document.getElementById('genre-track-bar-node');
  labelsContainer.innerHTML = ''; trackBarNode.innerHTML = '';

  if (!genres || genres.length === 0) {
    labelsContainer.innerHTML = `<div style="color:var(--text-muted);">No records calculated.</div>`; return;
  }

  const topGenres = genres.slice(0, 4);
  const total = topGenres.reduce((a, b) => a + b.amount, 0);
  const colors = ['#46c02b', '#1ea5ed', '#a239ca', '#ff5c8a'];

  topGenres.forEach((item, i) => {
    const hex = colors[i] || '#777';
    const pct = total > 0 ? ((item.amount / total) * 100).toFixed(0) : 0;

    labelsContainer.innerHTML += `
      <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
        <span style="background:${hex}; padding:3px 6px; border-radius:4px; font-size:10px; color:#fff; font-weight:bold;">${item.genre}</span>
        <span style="font-weight:700; color:var(--text-main); font-size:12px;">${item.amount} <span style="font-weight:normal; font-size:10px; color:var(--text-muted);">Titles</span></span>
      </div>
    `;
    trackBarNode.innerHTML += `<div style="height:100%; width:${pct}%; background-color:${hex};"></div>`;
  });
}

/* --- HISTORICAL LOG ACTIVITY BUILDERS --- */
function buildActivityStreamLogs(logs) {
  const target = document.getElementById('activity-logs-container');
  target.innerHTML = '';

  if(!logs || logs.length === 0) {
    target.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:12px;">No recent update entries logged to this user profile.</div>`;
    return;
  }

  logs.forEach(log => {
    if(!log.media) return;
    const item = document.createElement('div');
    item.className = 'activity-card-item';
    
    const title = log.media.title.romaji;
    const cover = log.media.coverImage.large;
    const progress = log.progress ? `ep/ch ${log.progress}` : '';
    const actionStatus = log.status ? log.status.toLowerCase().replace('_', ' ') : 'updated';
    const relativeTime = new Date(log.createdAt * 1000).toLocaleDateString(undefined, {month:'short', day:'numeric'});

    item.innerHTML = `
      <img src="${cover}" class="activity-card-img" alt="Thumbnail">
      <div class="activity-card-details">
        <strong style="color:var(--accent); font-weight:700;">${actionStatus}</strong> ${progress} <span style="color:var(--text-muted);">of</span> <br>
        <span style="font-weight:600; color:var(--text-main); display:inline-block; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</span>
        <div class="activity-card-time">${relativeTime}</div>
      </div>
    `;
    target.appendChild(item);
  });
}

/* --- FAVORITED ANIME GRID DRAWER --- */
function buildFavoritedAnimeSection(favorites) {
  const container = document.getElementById('favorites-mini-grid');
  container.innerHTML = '';

  if(!favorites || favorites.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:12px; grid-column:1/-1;">No entries marked as favorite.</div>`;
    return;
  }

  favorites.slice(0, 6).forEach(media => {
    const box = document.createElement('div');
    box.className = 'media-card';
    box.style.border = '1px solid var(--border-color)';
    box.innerHTML = `
      <img src="${media.coverImage.large}" style="height:120px;" alt="Poster Link">
      <div class="media-card-title" style="font-size:10px; padding:5px 4px 4px 4px;">${media.title.romaji}</div>
    `;
    box.addEventListener('click', () => openDetailsModal(media, null, null));
    container.appendChild(box);
  });
}

/* --- FAVORITED MANGA GRID DRAWER --- */
function buildFavoritedMangaSection(favorites) {
  const container = document.getElementById('favorites-manga-mini-grid');
  container.innerHTML = '';

  if(!favorites || favorites.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:12px; grid-column:1/-1;">No entries marked as favorite.</div>`;
    return;
  }

  favorites.slice(0, 6).forEach(media => {
    const box = document.createElement('div');
    box.className = 'media-card';
    box.style.border = '1px solid var(--border-color)';
    box.innerHTML = `
      <img src="${media.coverImage.large}" style="height:120px;" alt="Poster Link">
      <div class="media-card-title" style="font-size:10px; padding:5px 4px 4px 4px;">${media.title.romaji}</div>
    `;
    box.addEventListener('click', () => openDetailsModal(media, null, null));
    container.appendChild(box);
  });
}

/* --- SORTED TRACKING LIST INVENTORY DISPLAY GRIDS PLATFORM --- */
async function fetchAndRenderUserList(userId, mediaType, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--text-muted);">Parsing matrix directory rows...</div>`;

  const query = `
    query($userId: Int, $type: MediaType) {
      MediaListCollection(userId: $userId, type: $type) {
        lists { 
          entries { 
            score(format: POINT_100) status
            media { id title { romaji } coverImage { large } format status averageScore description } 
          } 
        }
      }
    }
  `;

  try {
    const res = await fetch(GRAPHQL_API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { userId, type: mediaType } })
    });
    const parsed = await res.json();
    
    container.innerHTML = ''; 
    const lists = parsed.data?.MediaListCollection?.lists;
    if(!lists || lists.length === 0) return container.innerHTML = `<div style="grid-column: 1/-1; color:var(--text-muted); text-align:center; padding:30px;">Collection index matrix is empty.</div>`;

    let allEntries = [];
    lists.forEach(list => { 
      list.entries.forEach(entry => { 
        if(entry.media) {
          allEntries.push({
            media: entry.media,
            personalScore: entry.score || 0,
            personalStatus: entry.status || 'PLANNING'
          });
        }
      }) 
    });
    
    // CRITICAL ENGINE RULE: Sort descending by score. Unrated items gravitate down to base layers
    allEntries.sort((a, b) => b.personalScore - a.personalScore);
    
    renderEntriesToGrid(allEntries, container);
  } catch(e) { container.innerHTML = `<div style="color:#ff4a4a; grid-column:1/-1; text-align:center;">Failed to populate structural grid items.</div>`; }
}

/* --- SEARCH ENGINE ROUTE ACTIONS --- */
async function executeGlobalDatabaseSearch() {
  const queryText = document.getElementById('search-engine-input').value.trim();
  const container = document.getElementById('search-results-grid');
  
  if(!queryText) return;
  container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-muted);">Querying data nodes directory index...</div>`;

  const query = `
    query($search: String) {
      Page(page: 1, perPage: 24) {
        media(search: $search, sort: POPULARITY_DESC) { id title { romaji } coverImage { large } format status averageScore description }
      }
    }
  `;

  try {
    const res = await fetch(GRAPHQL_API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { search: queryText } })
    });
    const parsed = await res.json();
    
    container.innerHTML = '';
    const results = parsed.data?.Page?.media;
    if(!results || results.length === 0) return container.innerHTML = `<div style="grid-column: 1/-1; color:var(--text-muted); text-align:center; padding:40px;">No matches structural indices verified for target query parameter.</div>`;

    const wrappedEntries = results.map(media => ({ media: media, personalScore: null, personalStatus: null }));
    renderEntriesToGrid(wrappedEntries, container);
  } catch(e) { container.innerHTML = `<div style="color:#ff4a4a; grid-column: 1/-1; text-align:center;">An error occurred during global directory lookup routines.</div>`; }
}

/* --- UNIVERSAL CARD LAYER COMPONENT PAINTER --- */
function renderEntriesToGrid(entriesArray, containerElement) {
  containerElement.innerHTML = '';
  entriesArray.forEach(entry => {
    const media = entry.media;
    if(!media || !media.coverImage) return;

    const card = document.createElement('div');
    card.className = 'media-card';
    
    const displayStatus = entry.personalStatus ? entry.personalStatus.toLowerCase() : '';
    const displayScore = entry.personalScore ? `★ ${entry.personalScore}` : 'unrated';

    card.innerHTML = `
      <img src="${media.coverImage.large}" alt="Poster thumbnail image graphic asset file">
      <div class="media-card-title">${media.title.romaji}</div>
      <div class="media-card-badges">
        <span class="badge-status">${displayStatus}</span>
        <span class="badge-score">${displayScore}</span>
      </div>
    `;
    
    card.addEventListener('click', () => openDetailsModal(media, entry.personalStatus, entry.personalScore));
    containerElement.appendChild(card);
  });
}

/* --- INTERACTIVE MODAL COMPONENT EDITOR PANEL --- */
async function openDetailsModal(media, existingStatus, existingScore) {
  CURRENTLY_OPENED_MEDIA_ID = media.id;
  const modal = document.getElementById('media-details-modal');
  
  document.getElementById('modal-img').src = media.coverImage.large || '';
  document.getElementById('modal-title').innerText = media.title.romaji || 'Unknown Title';
  
  const format = media.format ? media.format.replace('_', ' ') : 'N/A';
  const status = media.status || 'UNKNOWN';
  const score = media.averageScore ? `${media.averageScore}%` : 'N/A';
  document.getElementById('modal-meta').innerHTML = `<span>${format}</span> • <span>${status}</span> • <span>GLOBAL AVG: ${score}</span>`;
  document.getElementById('modal-desc').innerHTML = media.description || 'No database content synopsis catalogued for this directory record item.';
  
  document.getElementById('modal-edit-status').value = existingStatus || 'PLANNING';
  document.getElementById('modal-edit-score').value = existingScore || '';
  
  document.getElementById('modal-action-status').style.display = 'none';
  modal.style.display = 'flex';
}

/* --- MUTATION SAVE DATA CONTROLLERS --- */
document.getElementById('modal-save-entry-btn').addEventListener('click', async () => {
  if(!ACTIVE_SESSION_TOKEN) return showModalStatusMessage("Error: Incomplete session configuration maps.", "#ff4a4a");

  const selectedStatus = document.getElementById('modal-edit-status').value;
  const typedScore = parseInt(document.getElementById('modal-edit-score').value, 10) || 0;
  
  showModalStatusMessage("Committing tracking variables...", "#3db4f2");

  let query = '';
  let variables = { mediaId: CURRENTLY_OPENED_MEDIA_ID };

  if(selectedStatus === "REMOVE") {
    // Need the actual media list entry id (not the media id) to delete
    const entryId = await getCurrentMediaListEntryId(CACHED_USER_ID, CURRENTLY_OPENED_MEDIA_ID);
    if(!entryId) {
      showModalStatusMessage("No list entry found to remove.", "#ff4a4a");
      return;
    }
    query = `mutation($entryId: Int) { DeleteMediaListEntry(id: $entryId) { deleted } }`;
    variables = { entryId };
  } else {
    query = `
      mutation($mediaId: Int, $status: MediaListStatus, $score: Int) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $score) { id status }
      }
    `;
    variables.status = selectedStatus;
    variables.score = typedScore;
  }

  try {
    const res = await fetch(GRAPHQL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ACTIVE_SESSION_TOKEN },
      body: JSON.stringify({ query, variables })
    });
    const resultJson = await res.json();
    if(resultJson.errors) throw new Error(resultJson.errors[0].message || JSON.stringify(resultJson.errors));

    showModalStatusMessage("Changes successfully pushed to cloud!", "#00ffaa");
    
    setTimeout(() => {
      syncRenderCloudDataMetrics();
      if(document.getElementById('subview-animelist').style.display === 'block') fetchAndRenderUserList(CACHED_USER_ID, 'ANIME', 'anime-grid-node');
      if(document.getElementById('subview-mangalist').style.display === 'block') fetchAndRenderUserList(CACHED_USER_ID, 'MANGA', 'manga-grid-node');
    }, 1000);

  } catch(err) {
    console.error("Mutation failure state handled:", err);
    showModalStatusMessage("Transaction rejected by cloud instance node: " + (err.message || err), "#ff4a4a");
  }
});

async function getCurrentMediaListEntryId(userId, mediaId) {
  if(!userId || !mediaId) return null;
  try {
    const q = `query($userId: Int, $mediaId: Int) { MediaList(userId: $userId, mediaId: $mediaId) { id } }`;
    const res = await fetch(GRAPHQL_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ACTIVE_SESSION_TOKEN }, body: JSON.stringify({ query: q, variables: { userId, mediaId } }) });
    const parsed = await res.json();
    return parsed.data?.MediaList?.id || null;
  } catch(e) { return null; }
}

function showModalStatusMessage(msg, hexColor) {
  const label = document.getElementById('modal-action-status');
  label.innerText = msg; label.style.color = hexColor; label.style.display = 'block';
}

function renderBannerMessage(id, msg, color) {
  const el = document.getElementById(id);
  el.innerText = msg; el.style.backgroundColor = color;
  el.style.color = color === '#00ffaa' ? '#0b1622' : '#ffffff'; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

document.getElementById('ad-button').addEventListener('click', () => {
  const adsterraSmartLink = "https://www.effectivecpmnetwork.com/id3tfk7z7?key=2fbba1ac8ca7a1b49ffbf76e33edb7cc";
  
  // Calls the preload script to open the native browser safely
  window.electronAPI.openAdBrowser(adsterraSmartLink);
});