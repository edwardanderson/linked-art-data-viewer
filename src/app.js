const form = document.getElementById('url-form');
const urlInput = document.getElementById('url-input');
const contentEl = document.getElementById('content');
const breadcrumbsEl = document.getElementById('breadcrumbs');
const footerEl = document.getElementById('footer');
const loadButton = document.getElementById('load-button');

let jsonFetchCache = new Map();
let breadcrumbTrail = [];

form.addEventListener('submit', event => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (url) {
    loadUrl(url);
  }
});

async function loadUrl(url, addToHistory = true) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      alert(`Failed to load JSON from ${url}: ${res.statusText}`);
      return;
    }

    const json = await res.json();
    jsonFetchCache.set(url, true);

    const context = json['@context'];

    // ✨ Detect Linked Art search context
    if (context === 'https://linked.art/ns/v1/search.json') {
      renderSearchResults(json);
    } else {
      renderPage(json, url);
    }

    // 🔧 UI state updates
    updateBreadcrumbs(url, json);
    updateFooter(json);
    urlInput.value = url;
    window.scrollTo(0, 0);

    // 🔁 History handling
    if (addToHistory) {
      history.pushState({ url }, '', `?url=${encodeURIComponent(url)}`);
    }

  } catch (err) {
    console.error(`Error loading ${url}:`, err);
    alert(`Error fetching ${url}: ${err.message}`);
  }
}

function renderPage(json, baseUrl) {
  contentEl.innerHTML = '';

  // ✅ Clone root JSON and omit _links
  const { _links, ...rest } = json;
  const rootSection = renderValue(rest);

  contentEl.appendChild(rootSection);

  showLoading(true);

  addLinkedArtClassToJsonLinks().finally(() => {
    showLoading(false);
  });
}

function renderSearchPage(page) {
  contentEl.innerHTML = '';

  const h2 = document.createElement('h2');
  h2.textContent = 'Search results';
  contentEl.appendChild(h2);

  // Optional summary (from parent collection)
  const summary = page.partOf?.[0]?.summary?.en?.[0];
  if (summary) {
    const summaryP = document.createElement('p');
    summaryP.textContent = summary;
    summaryP.classList.add('search-results-summary');
    contentEl.appendChild(summaryP);
  }

  // If the items are aggregating OrderedCollections (estimates), render links
  const onlyHasCollections = Array.isArray(page.orderedItems) &&
    page.orderedItems.every(item => item.type === 'OrderedCollection');

  if (onlyHasCollections) {
    const ul = document.createElement('ul');
    ul.classList.add('search-results');

    page.orderedItems.forEach(coll => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = `${coll.totalItems} item${coll.totalItems !== 1 ? 's' : ''}`;
      link.addEventListener('click', e => {
        e.preventDefault();
        loadUrl(coll.id);
      });
      const contextText = coll.name || '(no name)';
      li.appendChild(link);
      li.insertAdjacentText('beforeend', ` – ${contextText}`);
      ul.appendChild(li);
    });

    contentEl.appendChild(ul);
  } else {
    // Fall back to normal item rendering
    const ul = document.createElement('ul');
    ul.classList.add('search-results');

    for (const item of page.orderedItems) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = item.id;
      a.addEventListener('click', e => {
        e.preventDefault();
        loadUrl(item.id);
      });
      li.appendChild(a);
      ul.appendChild(li);
    }

    contentEl.appendChild(ul);
  }

  // Navigation (prev/next)
  if (page.prev || page.next) {
    const nav = document.createElement('div');
    nav.classList.add('search-nav');

    if (page.prev) {
      const prev = document.createElement('a');
      prev.href = page.prev.id;
      prev.textContent = '← Previous';
      prev.addEventListener('click', (e) => {
        e.preventDefault();
        loadUrl(page.prev.id);
      });
      nav.appendChild(prev);
    }

    if (page.next) {
      const next = document.createElement('a');
      next.href = page.next.id;
      next.textContent = 'Next →';
      next.addEventListener('click', (e) => {
        e.preventDefault();
        loadUrl(page.next.id);
      });
      nav.appendChild(next);
    }

    contentEl.appendChild(nav);
  }
}

function renderSearchCollection(collection) {
  contentEl.innerHTML = '';

  // Title
  const h2 = document.createElement('h2');
  h2.textContent = collection.label?.en?.[0] || 'Search results';
  contentEl.appendChild(h2);

  // Summary
  if (collection.summary?.en?.[0]) {
    const summary = document.createElement('p');
    summary.textContent = collection.summary.en[0];
    summary.classList.add('search-results-summary');
    contentEl.appendChild(summary);
  }

  // List of grouped links (from orderedItems or a fallback)
  const ul = document.createElement('ul');
  ul.classList.add('search-results');

  for (const item of collection.orderedItems || []) {
    const li = document.createElement('li');

    const a = document.createElement('a');
    a.href = '#';
    a.classList.add('_linked-art-resource');

    if (typeof item.totalItems === 'number') {
      a.textContent = `${item.totalItems} item${item.totalItems === 1 ? '' : 's'}`;
    } else {
      a.textContent = item._label || item.id;
    }

    a.addEventListener('click', e => {
      e.preventDefault();
      loadUrl(item.id);
    });

    li.appendChild(a);
    ul.appendChild(li);
  }

  contentEl.appendChild(ul);
}

async function renderCollection(collection, container) {
  // Clear container
  container.innerHTML = '';

  // Render label
  const title = collection.label?.en?.[0] || 'No Title';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  container.appendChild(h2);

  // Render summary
  const summary = collection.summary?.en?.[0];
  if (summary) {
    const p = document.createElement('p');
    p.textContent = summary;
    container.appendChild(p);
  }

  // Check if collection has items inline
  if (collection.orderedItems && collection.orderedItems.length) {
    renderItems(collection.orderedItems, container);
    return;
  }

  // If not inline, fetch the first page if present
  if (collection.first?.id) {
    try {
      const response = await fetch(collection.first.id);
      if (!response.ok) {
        throw new Error(`Failed to fetch collection page: ${response.status}`);
      }
      const pageData = await response.json();

      if (pageData.orderedItems && pageData.orderedItems.length) {
        renderItems(pageData.orderedItems, container);
      } else {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'No items found in the collection.';
        container.appendChild(emptyMsg);
      }
    } catch (error) {
      const errMsg = document.createElement('p');
      errMsg.style.color = 'red';
      errMsg.textContent = 'Error loading collection items: ' + error.message;
      container.appendChild(errMsg);
    }
  } else {
    const noItemsMsg = document.createElement('p');
    noItemsMsg.textContent = 'No items to display.';
    container.appendChild(noItemsMsg);
  }
}

function renderItems(items, container) {
  const ul = document.createElement('ul');
  for (const item of items) {
    const li = document.createElement('li');
    // Use label if available, else id
    const label = item.label?.en?.[0] || item.id || 'Untitled item';
    li.textContent = label;
    ul.appendChild(li);
  }
  container.appendChild(ul);
}


function renderSearchResults(data) {
  if (data.type === 'OrderedCollectionPage') {
    renderSearchPage(data);
  } else if (data.type === 'OrderedCollection') {
    renderSearchCollection(data);
  } else {
    renderError(`Unsupported search result type: ${data.type}`);
  }
}

function showLoading(isLoading) {
  if (isLoading) {
    loadButton.disabled = true;
    loadButton.classList.add('loading');
  } else {
    loadButton.disabled = false;
    loadButton.classList.remove('loading');
  }
}

function renderObject(obj, path = '$') {
  const section = document.createElement('section');
  section.dataset.jqPath = path;
  section.title = path;

  if (obj.type) {
    const typeWrapper = document.createElement('p');
    const typeCode = document.createElement('code');
    typeCode.textContent = obj.type;
    typeWrapper.appendChild(typeCode);
    section.appendChild(typeWrapper);
    section.classList.add(obj.type);
  }

  if (obj.id) {
    const linkWrapper = document.createElement('p');
    const a = document.createElement('a');
    a.href = obj.id;
    a.textContent = obj._label || obj.id;
    a.className = obj.type || '';
    linkWrapper.appendChild(a);
    section.appendChild(linkWrapper);
  }

  if ('content' in obj && typeof obj.content === 'string') {
    const blockquote = document.createElement('blockquote');
    blockquote.textContent = obj.content;
    section.appendChild(blockquote);
  }

  for (const key of Object.keys(obj)) {
    if (['id', '_label', 'type', '@context', 'content'].includes(key)) continue;

    const label = document.createElement('p');
    label.innerHTML = `<strong>${key.replace(/_/g, ' ')}</strong>`;
    section.appendChild(label);

    const valueNode = renderValue(obj[key], `${path}.${key}`);
    section.appendChild(valueNode);
  }

  return section;
}

function renderValue(val, path = '$') {
  if (Array.isArray(val)) {
    const fragment = document.createDocumentFragment();
    val.forEach((item, i) => {
      const childPath = `${path}[${i}]`;
      fragment.appendChild(renderValue(item, childPath));
    });
    return fragment;
  }

  if (typeof val === 'object' && val !== null) {
    const section = document.createElement('section');
    section.dataset.jqPath = path;
    section.title = path;

    if (val.type) {
      section.classList.add(val.type);
      const typeWrapper = document.createElement('p');
      const typeCode = document.createElement('code');
      typeCode.textContent = val.type;
      typeWrapper.appendChild(typeCode);
      section.appendChild(typeWrapper);
    }

    const isImage =
      val.type === 'DigitalObject' &&
      val.format?.startsWith('image/') &&
      Array.isArray(val.classified_as) &&
      val.classified_as.some(cls => {
        const label = cls._label || '';
        return label === 'full resolution image' || label === 'thumbnail image';
      });

    if (isImage && val.id) {
      const a = document.createElement('a');
      a.href = val.id;
      a.className = val.type || '';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      const img = document.createElement('img');
      img.src = val.id;
      img.alt = val._label || 'Image';
      img.style.maxWidth = '25%';
      img.style.margin = '1em 0';
      img.dataset.jqPath = `${path}.id`;
      img.title = `${path}.id`;

      a.appendChild(img);
      section.appendChild(a);
    } else if (val.id) {
      const a = document.createElement('a');
      a.href = val.id;
      a.textContent = val._label || val.id;
      a.className = val.type || '';
      a.dataset.jqPath = `${path}.id`;
      a.title = `${path}.id`;
      section.appendChild(a);
    }

    if ('content' in val && typeof val.content === 'string') {
      const blockquote = document.createElement('blockquote');
      blockquote.textContent = val.content;
      blockquote.dataset.jqPath = `${path}.content`;
      blockquote.title = `${path}.content`;
      section.appendChild(blockquote);
    }

    for (const key of Object.keys(val)) {
      if (['id', '_label', 'type', '@context', 'content'].includes(key)) continue;

      const label = document.createElement('p');
      label.innerHTML = `<strong>${key.replace(/_/g, ' ')}</strong>`;
      section.appendChild(label);

      const childValue = renderValue(val[key], `${path}.${key}`);
      section.appendChild(childValue);
    }

    return section;
  }

  const p = document.createElement('p');
  p.textContent = val;
  p.dataset.jqPath = path;
  p.title = path;
  return p;
}

function updateBreadcrumbs(url, json) {
  // 1. Compute label
  let label;

  if (json['@context'] === 'https://linked.art/ns/v1/search.json') {
    // Use the localized label if available
    const labels = json.label?.en;
    label = Array.isArray(labels) && labels[0]
      ? labels[0]
      : 'Search';

    // Append page number fragment if present in URL
    const m = url.match(/[?&]page=(\d+)/);
    if (m) {
      label += ` #${m[1]}`;
    }
  } else {
    // Normal Linked Art document
    label = json._label || json.id || url;
  }

  // 2. Maintain breadcrumbTrail without duplicates
  const existingIndex = breadcrumbTrail.findIndex(crumb => crumb.url === url);
  if (existingIndex !== -1) {
    breadcrumbTrail = breadcrumbTrail.slice(0, existingIndex + 1);
  } else {
    breadcrumbTrail.push({ url, label });
  }

  // 3. Render breadcrumbs
  breadcrumbsEl.innerHTML = '';
  breadcrumbTrail.forEach((crumb, index) => {
    const a = document.createElement('a');
    a.href = crumb.url;
    a.textContent = crumb.label;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      breadcrumbTrail = breadcrumbTrail.slice(0, index + 1);
      loadUrl(crumb.url);
    });
    breadcrumbsEl.appendChild(a);

    if (index < breadcrumbTrail.length - 1) {
      breadcrumbsEl.appendChild(document.createTextNode(' > '));
    }
  });
}

function updateFooter(json) {
  footerEl.innerHTML = ''; // Clear previous content

  // Handle HAL _links if present
  const links = json._links;
  if (links && typeof links === 'object') {
    const curies = Array.isArray(links.curies) ? links.curies : [];
    const curieMap = new Map();
    for (const curie of curies) {
      if (curie.name && curie.href) {
        curieMap.set(curie.name, curie.href);
      }
    }

    const heading = document.createElement('h2');
    heading.textContent = 'Search';
    footerEl.appendChild(heading);

    const linkTable = document.createElement('table');
    linkTable.style.marginTop = '0.5em';

    for (const [key, value] of Object.entries(links)) {
      if (key === 'curies' || key === 'self') continue;
      if (!value || typeof value !== 'object' || !value.href) continue;

      const row = document.createElement('tr');

      // First column: CURIE link
      const curieCell = document.createElement('td');
      const curieLink = document.createElement('a');
      let fullRelUrl = '#';

      const [prefix, rel] = key.split(':');
      if (prefix && rel && curieMap.has(prefix)) {
        fullRelUrl = curieMap.get(prefix).replace('{rel}', rel);
      }

      curieLink.href = fullRelUrl;
      curieLink.textContent = key;
      curieLink.target = '_blank';
      curieLink.rel = 'noopener noreferrer';
      curieCell.appendChild(curieLink);
      row.appendChild(curieCell);

      // Second column: HAL target link
      const hrefCell = document.createElement('td');
      const hrefLink = document.createElement('a');
      hrefLink.href = value.href;
      hrefLink.classList.add('_linked-art-resource');

      hrefLink.addEventListener('click', (e) => {
        e.preventDefault();
        loadUrl(value.href);
      });

      if (value._estimate) {
        hrefLink.textContent = `${value._estimate} record${value._estimate === 1 ? '' : 's'}`;
      } else {
        hrefLink.textContent = value.href;
      }

      hrefCell.appendChild(hrefLink);
      row.appendChild(hrefCell);

      linkTable.appendChild(row);
    }

    footerEl.appendChild(linkTable);
  }

  // View source link (always added last)
  if (json.id) {
    const a = document.createElement('a');
    a.href = json.id;
    a.textContent = 'View source data';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'block';
    a.style.marginTop = '1em';
    footerEl.appendChild(a);
  }
}

async function checkIfJsonUrl(url) {
  if (jsonFetchCache.has(url)) return jsonFetchCache.get(url);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/ld+json;profile="https://linked.art/ns/v1/linked-art.json"'
      }
    });

    if (!res.ok) {
      jsonFetchCache.set(url, false);
      return false;
    }

    const contentType = res.headers.get('Content-Type') || '';
    const isJson = contentType.includes('json');
    jsonFetchCache.set(url, isJson);
    return isJson;
  } catch {
    jsonFetchCache.set(url, false);
    return false;
  }
}

async function addLinkedArtClassToJsonLinks() {
  const anchors = Array.from(contentEl.querySelectorAll('a[href]'));
  const rootAnchor = contentEl.querySelector('section > a[href]');

  const toCheck = anchors
    .filter(a => a !== rootAnchor && !a.classList.contains('_linked-art-resource'));

  const results = await limitConcurrency(toCheck, 25, async (a) => {
    const isJson = await checkIfJsonUrl(a.href);
    return { a, isJson };
  });

  for (const { a, isJson } of results) {
    if (isJson) {
      a.classList.add('_linked-art-resource');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        loadUrl(a.href);
      });
    }
  }
}

// Generic concurrency limiter
async function limitConcurrency(items, limit, asyncFn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await asyncFn(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}

function findImageUrlFromVisualItem(item) {
  for (const digitalObject of item.digitally_shown_by || []) {
    const accessPoints = digitalObject.access_point || [];

    for (const ap of accessPoints) {
      return ap.id;
    }
  }
  return null;
}

// Load URL from query parameter or input value on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get('url');

  if (urlParam) {
    const decodedUrl = decodeURIComponent(urlParam);
    urlInput.value = decodedUrl;
    loadUrl(decodedUrl);
  } else if (urlInput.value) {
    loadUrl(urlInput.value);
  }
});

window.addEventListener('popstate', (event) => {
  const url = event.state?.url;
  if (url) {
    loadUrl(url, false); // Don't push again to history
  }
});


function loadWithSpinner(buttonEl, url) {
  buttonEl.classList.add('loading');
  buttonEl.disabled = true;

  loadUrl(url).finally(() => {
    buttonEl.classList.remove('loading');
    buttonEl.disabled = false;
  });
}
