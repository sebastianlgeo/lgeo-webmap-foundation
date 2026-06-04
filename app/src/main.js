(function () {
  const config = window.WEBMAP_CONFIG;

  const state = {
    map: null,
    hoverPopup: null,
    activePopup: null,
    officeOverlayMarker: null,
    lastPopupClick: "",
    theme: "day",
    projects: [],
    projectsByNumber: new Map(),
    geographyIndex: {},
    geographyLookup: new Map(),
    activeTypes: new Set(),
    projectTypeCounts: {},
    geographyMetrics: new Map(),
    mapReady: false,
    styleReady: false
  };

  const els = {
    mapStatus: document.getElementById("mapStatus"),
    tokenPanel: document.getElementById("tokenPanel"),
    tokenInput: document.getElementById("tokenInput"),
    saveTokenButton: document.getElementById("saveTokenButton"),
    resetViewButton: document.getElementById("resetViewButton"),
    themeButton: document.getElementById("themeButton"),
    filterButton: document.getElementById("filterButton"),
    filterPanel: document.getElementById("filterPanel"),
    regionSearchInput: document.getElementById("regionSearchInput"),
    regionSearchResults: document.getElementById("regionSearchResults"),
    selectAllTypesButton: document.getElementById("selectAllTypesButton"),
    projectTypeToggles: document.getElementById("projectTypeToggles")
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindControls();
    setStatus("Loading project data");

    try {
      await loadData();
      state.projectTypeCounts = countBy(state.projects, "projectType");
      state.activeTypes = new Set(Object.keys(state.projectTypeCounts));
      recomputeGeographyMetrics();
      renderProjectTypeToggles();
    } catch (error) {
      setStatus(`Data error: ${error.message}`);
      return;
    }

    const token = getMapboxToken();
    if (!window.mapboxgl) {
      setStatus("Mapbox GL JS did not load");
      return;
    }
    if (!token) {
      els.tokenPanel.hidden = false;
      setStatus("Add a Mapbox token to preview the map");
      return;
    }

    startMap(token);
  }

  function bindControls() {
    els.saveTokenButton.addEventListener("click", () => {
      const token = els.tokenInput.value.trim();
      if (token) {
        localStorage.setItem("lgeo.webmap.mapboxToken", token);
        window.location.reload();
      }
    });

    els.resetViewButton.addEventListener("click", () => {
      if (!state.map) return;
      fitStartupBounds(false);
    });

    els.themeButton.addEventListener("click", () => {
      state.theme = state.theme === "day" ? "dark" : "day";
      els.themeButton.classList.toggle("active", state.theme === "dark");
      els.themeButton.title = state.theme === "dark" ? "Switch to day map" : "Switch to dark map";

      if (!state.map) return;
      state.styleReady = false;
      state.map.setStyle(getStyleUrl());
    });

    els.filterButton.addEventListener("click", () => {
      els.filterPanel.classList.toggle("open");
      els.filterButton.classList.toggle("active", els.filterPanel.classList.contains("open"));
    });

    els.selectAllTypesButton.addEventListener("click", () => {
      const allTypes = Object.keys(state.projectTypeCounts);
      const allSelected = allTypes.every((type) => state.activeTypes.has(type));
      state.activeTypes = new Set(allSelected ? [] : allTypes);
      recomputeGeographyMetrics();
      renderProjectTypeToggles();
      refreshLayerStyles();
      renderRegionSearchResults(els.regionSearchInput.value);
    });

    const brandLogo = document.querySelector(".brand-logo");
    if (brandLogo) {
      brandLogo.addEventListener("click", zoomToOffice);
      brandLogo.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          zoomToOffice();
        }
      });
    }

    els.regionSearchInput.addEventListener("input", () => {
      renderRegionSearchResults(els.regionSearchInput.value);
    });

    els.regionSearchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const firstResult = els.regionSearchResults.querySelector(".search-result");
      if (firstResult) firstResult.click();
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".region-search")) {
        els.regionSearchResults.classList.remove("open");
      }
    });
  }

  async function loadData() {
    const [projects, geographyIndex] = await Promise.all([
      fetchData(config.data.projectsUrl, "projects"),
      fetchData(config.data.geographyIndexUrl, "geographyIndex")
    ]);

    state.projects = projects;
    state.projectsByNumber = new Map(
      projects.map((project) => [String(project.projectNumber || ""), project])
    );

    state.geographyIndex = geographyIndex;
    state.geographyLookup = new Map(
      Object.keys(geographyIndex).map((name) => [normalizeGeography(name), geographyIndex[name]])
    );
  }

  async function fetchData(url, fallbackKey) {
    const bundled = window.LGEO_WEBMAP_DATA;
    const bundledValue = bundled && (
      bundled[fallbackKey] ||
      (bundled.geojson && bundled.geojson[fallbackKey])
    );

    if (location.protocol === "file:" && bundledValue) {
      return structuredCloneSafe(bundledValue);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return response.json();
    } catch (error) {
      if (bundledValue) return structuredCloneSafe(bundledValue);
      throw error;
    }
  }

  function structuredCloneSafe(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function getMapboxToken() {
    return (
      window.LGEO_MAPBOX_TOKEN ||
      localStorage.getItem("lgeo.webmap.mapboxToken") ||
      config.mapbox.accessToken ||
      ""
    ).trim();
  }

  function getStyleUrl() {
    if (state.theme === "dark") {
      return config.mapbox.darkStyleUrl || config.mapbox.styleUrl;
    }
    return config.mapbox.dayStyleUrl || config.mapbox.styleUrl;
  }

  function startMap(token) {
    mapboxgl.accessToken = token;

    state.map = new mapboxgl.Map({
      container: "map",
      style: getStyleUrl(),
      center: config.mapbox.center,
      zoom: config.mapbox.zoom,
      maxBounds: config.mapbox.maxBounds,
      attributionControl: true
    });

    window.__lgeoMap = state.map;
    window.__lgeoState = state;

    state.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    state.map.on("load", () => {
      state.mapReady = true;
      state.styleReady = true;
      setStatus("Ready");
      addMapLayers();
      addOfficeMarker();
      fitStartupBounds(false);
      hideReadyStatus();
    });

    state.map.on("idle", () => {
      addOfficeMarker();
    });

    state.map.on("style.load", () => {
      if (!state.mapReady) return;
      state.styleReady = true;
      setStatus("Ready");
      addMapLayers();
      addOfficeMarker();
      hideReadyStatus();
    });

    state.map.on("error", (event) => {
      if (event && event.error) setStatus(event.error.message);
    });
  }

  function addMapLayers() {
    if (!state.map || !state.styleReady) return;

    config.layers
      .filter((layer) => layer.kind === "polygon")
      .forEach(addLayerSet);

    config.layers
      .filter((layer) => layer.kind === "point")
      .forEach(addLayerSet);

    refreshLayerStyles();
  }

  function addLayerSet(layer) {
    addVectorSource(layer);

    if (layer.kind === "polygon") {
      addPolygonLayers(layer);
    } else {
      addPointLayers(layer);
    }
  }

  function addVectorSource(layer) {
    if (state.map.getSource(layer.id)) return;

    state.map.addSource(layer.id, {
      type: "vector",
      url: layer.tilesetUrl
    });
  }

  function sourceLayer(layer) {
    return layer.sourceLayer;
  }

  function metricMatchExpression(metricName, fallbackValue) {
    const expression = ["match", ["get", "NameKey"]];

    state.geographyMetrics.forEach((metrics, nameKey) => {
      expression.push(nameKey, metrics[metricName] ?? fallbackValue);
    });

    expression.push(fallbackValue);
    return expression;
  }

  function hasProjectsFilter() {
    return [">", metricMatchExpression("projectCount", 0), 0];
  }

  function lowerScaleReplacementFilter(value) {
    return ["==", metricMatchExpression("hasLowerScaleReplacement", true), value];
  }

  function promoteFromProvinceFilter(value) {
    return ["==", metricMatchExpression("promoteFromProvince", false), value];
  }

  function addPolygonLayers(layer) {
    if (!state.map.getLayer(layer.id)) {
      state.map.addLayer({
        id: layer.id,
        type: "fill",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom: layer.minzoom,
        maxzoom: layer.maxzoom,
        paint: {
          "fill-color": polygonFillColor(layer),
          "fill-opacity": [
            "interpolate",
            ["linear"],
            metricMatchExpression("projectCount", 0),
            0,
            0,
            1,
            0.14,
            8,
            0.24,
            25,
            0.34
          ]
        },
        filter: hasProjectsFilter()
      });
    }

    const lineId = `${layer.id}-line`;
    if (!state.map.getLayer(lineId)) {
      state.map.addLayer({
        id: lineId,
        type: "line",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom: layer.minzoom,
        maxzoom: layer.maxzoom,
        paint: {
          "line-color": polygonLineColor(),
          "line-opacity": 0.58,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            layer.minzoom || 0,
            0.7,
            layer.maxzoom || 14,
            1.8
          ]
        },
        filter: hasProjectsFilter()
      });
    }

    addPolygonContinuationLayers(layer);
    addPromotedMunicipalPolygonLayers(layer);
  }

  function polygonFillColor(layer) {
    if (state.theme === "dark") {
      return (config.darkTheme && config.darkTheme.polygonFillColor) || "#d98a45";
    }
    return layer.color || config.theme.polygonFillColor;
  }

  function polygonLineColor() {
    if (state.theme === "dark") {
      return (config.darkTheme && config.darkTheme.polygonLineColor) || "#ffb36c";
    }
    return config.theme.polygonLineColor;
  }

  function addPolygonContinuationLayers(layer) {
    if (layer.scale !== "provincial" && layer.scale !== "regional") return;

    const fillId = `${layer.id}-continuation`;
    const lineId = `${layer.id}-continuation-line`;

    if (!state.map.getLayer(fillId)) {
      state.map.addLayer({
        id: fillId,
        type: "fill",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom: layer.maxzoom,
        maxzoom: 24,
        paint: {
          "fill-color": polygonFillColor(layer),
          "fill-opacity": 0.16
        },
        filter: [
          "all",
          hasProjectsFilter(),
          lowerScaleReplacementFilter(false)
        ]
      });
    }

    if (!state.map.getLayer(lineId)) {
      state.map.addLayer({
        id: lineId,
        type: "line",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom: layer.maxzoom,
        maxzoom: 24,
        paint: {
          "line-color": polygonLineColor(),
          "line-opacity": 0.62,
          "line-width": 1.35
        },
        filter: [
          "all",
          hasProjectsFilter(),
          lowerScaleReplacementFilter(false)
        ]
      });
    }
  }

  function addPromotedMunicipalPolygonLayers(layer) {
    if (layer.scale !== "municipal") return;

    const fillId = `${layer.id}-promoted`;
    const lineId = `${layer.id}-promoted-line`;
    const minzoom = promotedMunicipalMinzoom();

    if (!state.map.getLayer(fillId)) {
      state.map.addLayer({
        id: fillId,
        type: "fill",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom,
        maxzoom: layer.minzoom,
        paint: {
          "fill-color": polygonFillColor(layer),
          "fill-opacity": 0.2
        },
        filter: [
          "all",
          hasProjectsFilter(),
          promoteFromProvinceFilter(true)
        ]
      });
    }

    if (!state.map.getLayer(lineId)) {
      state.map.addLayer({
        id: lineId,
        type: "line",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom,
        maxzoom: layer.minzoom,
        paint: {
          "line-color": polygonLineColor(),
          "line-opacity": 0.62,
          "line-width": 1.25
        },
        filter: [
          "all",
          hasProjectsFilter(),
          promoteFromProvinceFilter(true)
        ]
      });
    }
  }

  function addPointLayers(layer) {
    const circleId = `${layer.id}-circle`;
    const labelId = `${layer.id}-circle-label`;
    const zoomTransition = config.mapbox.zoomTransition || 0;
    const displayMinzoom = Math.max(0, layer.minzoom - zoomTransition);
    const displayMaxzoom = Math.min(24, layer.maxzoom + zoomTransition);

    if (!state.map.getLayer(circleId)) {
      state.map.addLayer({
        id: circleId,
        type: "circle",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom: displayMinzoom,
        maxzoom: displayMaxzoom,
        paint: {
          "circle-color": config.theme.unlinkedSymbolColor,
          "circle-radius": symbolRadiusExpression(),
          "circle-stroke-color": config.theme.symbolStrokeColor,
          "circle-stroke-width": 2,
          "circle-stroke-opacity": pointOpacityExpression(layer, 0.94),
          "circle-opacity": pointOpacityExpression(layer, 0.94)
        },
        filter: hasProjectsFilter()
      });
    }

    addPointContinuationLayers(layer, {
      "circle-color": config.theme.unlinkedSymbolColor,
      "circle-radius": symbolRadiusExpression(),
      "circle-stroke-color": config.theme.symbolStrokeColor,
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 0.94,
      "circle-opacity": 0.94
    });

    addPromotedMunicipalPointLayers(layer, {
      "circle-color": config.theme.unlinkedSymbolColor,
      "circle-radius": symbolRadiusExpression(),
      "circle-stroke-color": config.theme.symbolStrokeColor,
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 0.94,
      "circle-opacity": 0.94
    });

    if (!state.map.getLayer(labelId)) {
      state.map.addLayer({
        id: labelId,
        type: "symbol",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom: displayMinzoom,
        maxzoom: displayMaxzoom,
        layout: countLabelLayout(),
        paint: countLabelPaint(layer),
        filter: hasProjectsFilter()
      });
    }

    [circleId, labelId].forEach((id) => bindClick(layer, id));
  }

  function addPointContinuationLayers(layer, circlePaint) {
    if (layer.scale !== "provincial" && layer.scale !== "regional") return;

    const circleId = `${layer.id}-continuation-circle`;
    const labelId = `${layer.id}-continuation-circle-label`;

    if (!state.map.getLayer(circleId)) {
      state.map.addLayer({
        id: circleId,
        type: "circle",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom: layer.maxzoom,
        maxzoom: 24,
        paint: circlePaint,
        filter: [
          "all",
          hasProjectsFilter(),
          lowerScaleReplacementFilter(false)
        ]
      });
    }

    if (!state.map.getLayer(labelId)) {
      state.map.addLayer({
        id: labelId,
        type: "symbol",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom: layer.maxzoom,
        maxzoom: 24,
        layout: countLabelLayout(),
        paint: countLabelPaint(),
        filter: [
          "all",
          hasProjectsFilter(),
          lowerScaleReplacementFilter(false)
        ]
      });
    }

    [circleId, labelId].forEach((id) => bindClick(layer, id));
  }

  function addPromotedMunicipalPointLayers(layer, circlePaint) {
    if (layer.scale !== "municipal") return;

    const circleId = `${layer.id}-promoted-circle`;
    const labelId = `${layer.id}-promoted-circle-label`;
    const minzoom = promotedMunicipalMinzoom();

    if (!state.map.getLayer(circleId)) {
      state.map.addLayer({
        id: circleId,
        type: "circle",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom,
        maxzoom: layer.minzoom,
        paint: circlePaint,
        filter: [
          "all",
          hasProjectsFilter(),
          promoteFromProvinceFilter(true)
        ]
      });
    }

    if (!state.map.getLayer(labelId)) {
      state.map.addLayer({
        id: labelId,
        type: "symbol",
        source: layer.id,
        "source-layer": sourceLayer(layer),
        minzoom,
        maxzoom: layer.minzoom,
        layout: countLabelLayout(),
        paint: countLabelPaint(),
        filter: [
          "all",
          hasProjectsFilter(),
          promoteFromProvinceFilter(true)
        ]
      });
    }

    [circleId, labelId].forEach((id) => bindClick(layer, id));
  }

  function symbolRadiusExpression() {
    return [
      "interpolate",
      ["linear"],
      metricMatchExpression("projectCount", 0),
      1,
      13,
      4,
      17,
      10,
      22,
      30,
      30
    ];
  }

  function pointOpacityExpression(layer, baseOpacity) {
    const transition = config.mapbox.zoomTransition || 0;
    const minzoom = layer.minzoom || 0;
    const maxzoom = layer.maxzoom || 24;
    if (!transition) return baseOpacity;

    const stops = [];
    if (minzoom > 0) stops.push([Math.max(0, minzoom - transition), 0]);
    stops.push([minzoom, baseOpacity]);

    const fadeOutStart = Math.max(minzoom, maxzoom - transition);
    if (fadeOutStart > minzoom) stops.push([fadeOutStart, baseOpacity]);
    if (maxzoom > fadeOutStart) stops.push([maxzoom, 0]);

    return [
      "interpolate",
      ["linear"],
      ["zoom"],
      ...stops.flat()
    ];
  }

  function countLabelLayout() {
    return {
      "text-field": ["to-string", metricMatchExpression("projectCount", 0)],
      "text-size": [
        "interpolate",
        ["linear"],
        metricMatchExpression("projectCount", 0),
        1,
        11,
        10,
        13,
        30,
        15
      ],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-allow-overlap": true,
      "text-ignore-placement": true
    };
  }

  function countLabelPaint(layer) {
    return {
      "text-color": config.theme.symbolTextColor,
      "text-halo-color": "rgba(0,0,0,0)",
      "text-halo-width": 0,
      "text-opacity": layer ? pointOpacityExpression(layer, 1) : 1
    };
  }

  function refreshLayerStyles() {
    if (!state.map || !state.styleReady) return;

    const layerIds = [];
    config.layers.forEach((layer) => {
      if (layer.kind === "polygon") {
        layerIds.push(
          layer.id,
          `${layer.id}-line`,
          `${layer.id}-continuation`,
          `${layer.id}-continuation-line`,
          `${layer.id}-promoted`,
          `${layer.id}-promoted-line`
        );
      } else {
        layerIds.push(
          `${layer.id}-circle`,
          `${layer.id}-circle-label`,
          `${layer.id}-continuation-circle`,
          `${layer.id}-continuation-circle-label`,
          `${layer.id}-promoted-circle`,
          `${layer.id}-promoted-circle-label`
        );
      }
    });

    layerIds.forEach((id) => {
      if (!state.map.getLayer(id)) return;

      if (id.includes("continuation")) {
        state.map.setFilter(id, ["all", hasProjectsFilter(), lowerScaleReplacementFilter(false)]);
      } else if (id.includes("promoted")) {
        state.map.setFilter(id, ["all", hasProjectsFilter(), promoteFromProvinceFilter(true)]);
      } else {
        state.map.setFilter(id, hasProjectsFilter());
      }
    });

    layerIds.forEach((id) => {
      const mapLayer = state.map.getLayer(id);
      if (!mapLayer) return;

      if (mapLayer.type === "symbol" && id.endsWith("label")) {
        state.map.setLayoutProperty(id, "text-field", ["to-string", metricMatchExpression("projectCount", 0)]);
      }

      if (mapLayer.type === "circle") {
        state.map.setPaintProperty(id, "circle-radius", symbolRadiusExpression());
      }

      if (mapLayer.type === "fill") {
        state.map.setPaintProperty(id, "fill-color", polygonFillColor(findConfigLayerFromMapLayerId(id)));
      }

      if (mapLayer.type === "line") {
        state.map.setPaintProperty(id, "line-color", polygonLineColor());
      }
    });
  }

  function findConfigLayerFromMapLayerId(mapLayerId) {
    return config.layers.find((layer) => mapLayerId.startsWith(layer.id)) || {};
  }

  function recomputeGeographyMetrics() {
    state.geographyMetrics = new Map();

    Object.values(state.geographyIndex).forEach((entry) => {
      const nameKey = entry.geographyName;
      const filteredProjects = getFilteredProjectsForGeography(nameKey);
      const linkedCount = filteredProjects.filter((project) => project.projectUrl).length;

      state.geographyMetrics.set(nameKey, {
        projectCount: filteredProjects.length,
        linkedProjectCount: linkedCount,
        interactive: linkedCount > 0,
        hasLowerScaleReplacement: hasLowerScaleReplacementFromIndex(nameKey, filteredProjects),
        promoteFromProvince: shouldPromoteFromProvinceFromIndex(nameKey, filteredProjects)
      });
    });
  }

  function getFilteredProjectsForGeography(nameKey) {
    const geographyNames = [nameKey, ...getGeographyAliases(nameKey)];
    const projectsByNumber = new Map();

    geographyNames.forEach((geographyName) => {
      const entry = getGeographyIndexEntry(geographyName);
      if (!entry || !entry.projects) return;

      entry.projects.forEach((project) => {
        if (!state.activeTypes.has(project.projectType || "Uncategorized")) return;
        projectsByNumber.set(
          String(project.projectNumber || `${geographyName}-${project.projectName}`),
          project
        );
      });
    });

    return Array.from(projectsByNumber.values());
  }

  function hasLowerScaleReplacementFromIndex(nameKey, filteredProjects) {
    const entry = getGeographyIndexEntry(nameKey);
    const scales = entry && entry.scales ? entry.scales.map(String) : [];

    if (scales.includes("Municipal")) return true;

    if (scales.includes("Provincial")) {
      return filteredProjects.some((projectSummary) => {
        const project = state.projectsByNumber.get(String(projectSummary.projectNumber || ""));
        if (!project) return false;
        return Boolean(
          getProjectScaleNames(project, "Regional").length ||
          getProjectScaleNames(project, "Municipal").length
        );
      });
    }

    if (scales.includes("Regional")) {
      return filteredProjects.some((projectSummary) => {
        const project = state.projectsByNumber.get(String(projectSummary.projectNumber || ""));
        if (!project) return false;
        return Boolean(getProjectScaleNames(project, "Municipal").length);
      });
    }

    return true;
  }

  function shouldPromoteFromProvinceFromIndex(nameKey, filteredProjects) {
    const entry = getGeographyIndexEntry(nameKey);
    const scales = entry && entry.scales ? entry.scales.map(String) : [];
    if (!scales.includes("Municipal") || !filteredProjects.length) return false;

    return filteredProjects.some((projectSummary) => {
      const project = state.projectsByNumber.get(String(projectSummary.projectNumber || ""));
      if (!project || !getProjectScaleNames(project, "Provincial").length) return false;
      return !getProjectScaleNames(project, "Regional").length;
    });
  }

  function bindClick(layer, mapLayerId) {
    if (state.map.__lgeoBoundLayers && state.map.__lgeoBoundLayers.has(mapLayerId)) return;

    state.map.__lgeoBoundLayers = state.map.__lgeoBoundLayers || new Set();
    state.map.__lgeoBoundLayers.add(mapLayerId);

    state.map.on("click", mapLayerId, (event) => {
      if (isDuplicatePopupClick(event)) return;
      const feature = event.features && event.features[0];
      if (feature) showPopup(feature, event.lngLat);
    });

    state.map.on("mouseenter", mapLayerId, (event) => {
      state.map.getCanvas().style.cursor = "pointer";
      showHoverLabel(event);
    });

    state.map.on("mousemove", mapLayerId, (event) => {
      showHoverLabel(event);
    });

    state.map.on("mouseleave", mapLayerId, () => {
      state.map.getCanvas().style.cursor = "";
      hideHoverLabel();
    });
  }

  function showHoverLabel(event) {
    const feature = event.features && event.features[0];
    const name = feature && feature.properties && feature.properties.NameKey;
    if (!name) return;

    if (!state.hoverPopup) {
      state.hoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "hover-popup",
        offset: 14
      });
    }

    state.hoverPopup
      .setLngLat(event.lngLat)
      .setHTML(`<span>${escapeHtml(displayGeographyName(name))}</span>`)
      .addTo(state.map);
  }

  function hideHoverLabel() {
    if (state.hoverPopup) state.hoverPopup.remove();
  }

  function isDuplicatePopupClick(event) {
    const point = event.point || {};
    const lngLat = event.lngLat || {};
    const signature = [
      Math.round(point.x || 0),
      Math.round(point.y || 0),
      Number(lngLat.lng || 0).toFixed(5),
      Number(lngLat.lat || 0).toFixed(5)
    ].join(":");

    if (state.lastPopupClick === signature) return true;
    state.lastPopupClick = signature;

    window.setTimeout(() => {
      if (state.lastPopupClick === signature) state.lastPopupClick = "";
    }, 250);

    return false;
  }

  function replaceActivePopup(lngLat, html) {
  hideHoverLabel();
  closeActivePopup();

  const popup = new mapboxgl.Popup({
    anchor: "bottom",
    closeButton: true,
    maxWidth: "360px",
    offset: 18
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(state.map);

  const closeButton = popup.getElement().querySelector(".mapboxgl-popup-close-button");
  if (closeButton) {
    closeButton.removeAttribute("aria-hidden");

    closeButton.addEventListener("mousedown", () => {
      closeButton.blur();
    });

    closeButton.addEventListener("click", () => {
      closeButton.blur();
    });
  }

  state.activePopup = popup;
  popup.on("close", () => {
    if (document.activeElement === closeButton) {
      closeButton.blur();
    }

    if (state.activePopup === popup) state.activePopup = null;
  });
}

  function closeActivePopup() {
    if (state.activePopup) {
      if (
        document.activeElement &&
        document.activeElement.classList &&
        document.activeElement.classList.contains("mapboxgl-popup-close-button")
      ) {
        document.activeElement.blur();
      }

      const popup = state.activePopup;
      state.activePopup = null;
      popup.remove();
    }
  }

  function showPopup(feature, lngLat) {
    hideHoverLabel();

    const name = feature.properties.NameKey;
    const projects = getFilteredProjectsForGeography(name);
    const linkedCount = projects.filter((project) => project.projectUrl).length;

    zoomToGeography(name, feature.geometry);

    if (!projects.length || !shouldOpenPopupForGeography(name)) {
      closeActivePopup();
      return;
    }

    replaceActivePopup(lngLat, popupHtml(name, projects, linkedCount));
  }

  function showPopupForGeography(name) {
    if (!state.map) return;

    const projects = getFilteredProjectsForGeography(name);
    const linkedCount = projects.filter((project) => project.projectUrl).length;

    zoomToGeography(name, null);

    if (!projects.length || !shouldOpenPopupForGeography(name)) {
      closeActivePopup();
      return;
    }

    replaceActivePopup(state.map.getCenter(), popupHtml(name, projects, linkedCount));
  }

  function popupHtml(name, projects, linkedCount) {
    const projectList = sortPopupProjects(projects)
      .map((project) => {
        const rowClass = [
          "popup-project",
          project.featured ? "popup-project-featured" : "",
          project.projectUrl ? "popup-project-linked" : ""
        ].filter(Boolean).join(" ");

        const title = escapeHtml(project.projectName || project.projectNumber);
        const meta = escapeHtml([project.projectYear, project.projectType].filter(Boolean).join(" · "));

        const content = `
          <strong class="project-title-text">${title}</strong>
          <div class="popup-meta">${meta}</div>
        `;

        if (project.projectUrl) {
          return `
            <a class="${rowClass} popup-project-card-link" href="${escapeAttribute(project.projectUrl)}" target="_blank" rel="noopener">
              ${content}
            </a>
          `;
        }

        return `
          <div class="${rowClass}">
            ${content}
          </div>
        `;
      })
      .join("");

    return `
      <h3 class="popup-title">${escapeHtml(name)}</h3>
      <p class="popup-meta">${formatProjectCount(projects.length)}</p>
      <div class="popup-list">${projectList}</div>
    `;
  }

  function sortPopupProjects(projects) {
    return [...projects].sort((a, b) => {
      const featuredScore = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      if (featuredScore) return featuredScore;

      const linkedScore = Number(Boolean(b.projectUrl)) - Number(Boolean(a.projectUrl));
      if (linkedScore) return linkedScore;

      return String(b.projectYear || "").localeCompare(String(a.projectYear || ""));
    });
  }

  function renderProjectTypeToggles() {
    els.projectTypeToggles.innerHTML = "";

    const entries = Object.entries(state.projectTypeCounts).sort((a, b) => b[1] - a[1]);

    entries.forEach(([type, count]) => {
      const label = document.createElement("label");
      label.className = "type-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.activeTypes.has(type);

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.activeTypes.add(type);
        else state.activeTypes.delete(type);

        recomputeGeographyMetrics();
        refreshLayerStyles();
        renderRegionSearchResults(els.regionSearchInput.value);
      });

      const name = document.createElement("span");
      name.textContent = type || "Uncategorized";

      const total = document.createElement("span");
      total.className = "type-count";
      total.textContent = count;

      label.append(checkbox, name, total);
      els.projectTypeToggles.append(label);
    });
  }

  function renderRegionSearchResults(query) {
    const needle = query.trim().toLowerCase();
    els.regionSearchResults.innerHTML = "";

    if (needle.length < 2) {
      els.regionSearchResults.classList.remove("open");
      return;
    }

    const results = getSearchableGeographies()
      .filter((entry) => {
        const haystack = `${entry.name} ${entry.displayName}`.toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => scoreSearchEntry(b) - scoreSearchEntry(a) || a.displayName.localeCompare(b.displayName));

    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "search-result";
      empty.innerHTML = "<span class='search-result-title'>No matching regions</span>";
      els.regionSearchResults.append(empty);
      els.regionSearchResults.classList.add("open");
      return;
    }

    results.forEach((entry) => {
      const button = document.createElement("button");
      button.className = "search-result";
      button.type = "button";

      button.innerHTML = `
        <span class="search-result-title">${escapeHtml(entry.displayName)}</span>
        <span class="search-result-meta">${escapeHtml(formatProjectCount(entry.projectCount))} · ${escapeHtml(entry.scales.join(", "))}</span>
      `;

      button.addEventListener("click", () => {
        els.regionSearchInput.value = entry.displayName;
        els.regionSearchResults.classList.remove("open");
        showPopupForGeography(entry.name);
      });

      els.regionSearchResults.append(button);
    });

    els.regionSearchResults.classList.add("open");
  }

  function getSearchableGeographies() {
    return Object.values(state.geographyIndex).map((entry) => {
      const metrics = state.geographyMetrics.get(entry.geographyName) || {};
      return {
        name: entry.geographyName,
        displayName: displayGeographyName(entry.geographyName),
        projectCount: metrics.projectCount || 0,
        directCount: getDirectProjectsForGeography(entry.geographyName).length,
        scales: entry.scales || []
      };
    });
  }

  function getDirectProjectsForGeography(nameKey) {
    return getFilteredProjectsForGeography(nameKey).filter((projectSummary) => {
      const project = state.projectsByNumber.get(String(projectSummary.projectNumber || ""));
      return project && isDirectProjectForGeography(nameKey, project);
    });
  }

  function isDirectProjectForGeography(nameKey, project) {
    const directScale = scaleFromProjectLevel(project.projectLevel);
    if (directScale && sameGeography(geographyAtScale(project, directScale), nameKey)) return true;

    const mostSpecific = mostSpecificGeography(project);
    if (!sameGeography(mostSpecific.name, nameKey)) return false;
    if (mostSpecific.scale === "National") return false;
    if (mostSpecific.scale === "Provincial" && isExternalProjectLevel(project.projectLevel)) return false;

    return true;
  }

  function scaleFromProjectLevel(projectLevel) {
    const level = String(projectLevel || "").toLowerCase();
    if (level.includes("municipal")) return "Municipal";
    if (level.includes("regional")) return "Regional";
    if (level.includes("provincial") || level.includes("state") || level.includes("crown")) return "Provincial";
    if (level.includes("national") || level.includes("federal")) return "National";
    return "";
  }

  function mostSpecificGeography(project) {
    const scale = ["Municipal", "Regional", "Provincial", "National"].find((item) => geographyAtScale(project, item));
    return {
      name: scale ? geographyAtScale(project, scale) : project.primaryGeography || "",
      scale: scale || ""
    };
  }

  function geographyAtScale(project, scale) {
    return (
      (project.geographies && project.geographies[scale]) ||
      (project.polygonKeys && project.polygonKeys[scale]) ||
      ""
    );
  }

  function getProjectScaleNames(project, scale) {
    const names = [
      project.geographies && project.geographies[scale],
      project.polygonKeys && project.polygonKeys[scale]
    ].filter(Boolean);

    return names.flatMap((name) => [name, ...getGeographyAliases(name)]);
  }

  function getGeographyIndexEntry(nameKey) {
    return state.geographyIndex[nameKey] || state.geographyLookup.get(normalizeGeography(nameKey));
  }

  function getGeographyAliases(nameKey) {
    const aliases = config.geographyAliases || {};
    const directAliases = aliases[nameKey];
    if (directAliases) return directAliases;

    const matchedName = Object.keys(aliases).find((name) => sameGeography(name, nameKey));
    return matchedName ? aliases[matchedName] : [];
  }

  function sameGeography(left, right) {
    return normalizeGeography(left) === normalizeGeography(right);
  }

  function normalizeGeography(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function isExternalProjectLevel(projectLevel) {
    const level = String(projectLevel || "").toLowerCase();
    return level.includes("private") || level.includes("academic") || level.includes("non-profit");
  }

  function shouldOpenPopupForGeography(nameKey) {
    return !isNationalGeography(nameKey);
  }

  function isNationalGeography(nameKey) {
    const countryBounds = config.mapbox.countryBounds || {};
    if (Object.keys(countryBounds).some((countryName) => sameGeography(countryName, nameKey))) return true;

    const entry = getGeographyIndexEntry(nameKey);
    return Boolean(entry && entry.scales && entry.scales.length === 1 && entry.scales[0] === "National");
  }

  function promotedMunicipalMinzoom() {
    const regionalLayer = config.layers.find((layer) => layer.id === "RegionalLevelPoints");
    return regionalLayer ? regionalLayer.minzoom : 5.8;
  }

  function zoomToGeography(name, geometry) {
    const namedBounds = boundsForNamedGeography(name);
    if (namedBounds) {
      state.map.stop();
      const padding = config.mapbox.boundsPadding;
      const camera = state.map.cameraForBounds(namedBounds.bounds, { padding });

      if (!camera) {
        state.map.fitBounds(namedBounds.bounds, {
          padding,
          maxZoom: 5.1,
          duration: 500,
          essential: true
        });
        return;
      }

      const zoom = Math.max(camera.zoom || state.map.getZoom(), namedBounds.minZoom || 0);
      state.map.easeTo({
        center: camera.center,
        zoom,
        duration: 500,
        essential: true
      });
      return;
    }

    if (geometry) zoomToGeometry(geometry);
  }

  function zoomToGeometry(geometry) {
    const boundsInfo = boundsForGeometry(geometry);
    if (!boundsInfo) return;

    if (boundsInfo.isPoint) {
      state.map.stop();
      state.map.easeTo({
        center: boundsInfo.center,
        zoom: Math.max(state.map.getZoom(), 6.6),
        duration: 450,
        essential: true
      });
      return;
    }

    state.map.stop();
    state.map.fitBounds(boundsInfo.bounds, {
      padding: config.mapbox.boundsPadding,
      maxZoom: 9.5,
      duration: 500,
      essential: true
    });
  }

  function boundsForNamedGeography(name) {
    const namedBounds = {
      ...(config.mapbox.countryBounds || {}),
      ...(config.geographyBounds || {})
    };

    const matchedName = Object.keys(namedBounds).find((boundsName) => sameGeography(boundsName, name));
    if (!matchedName) return null;

    const bounds = namedBounds[matchedName];
    const minZooms = config.mapbox.countryMinZoom || {};

    return {
      isPoint: false,
      bounds: new mapboxgl.LngLatBounds(bounds[0], bounds[1]),
      minZoom: minZooms[matchedName] || 0
    };
  }

  function boundsForGeometry(geometry) {
    if (!geometry || !geometry.coordinates) return null;

    const coords = [];
    collectCoordinates(geometry.coordinates, coords);

    if (!coords.length) return null;
    if (coords.length === 1) return { isPoint: true, center: coords[0] };

    const bounds = coords.reduce(
      (box, coord) => box.extend(coord),
      new mapboxgl.LngLatBounds(coords[0], coords[0])
    );

    return { isPoint: false, bounds };
  }

  function collectCoordinates(value, output) {
    if (!Array.isArray(value)) return;

    if (typeof value[0] === "number" && typeof value[1] === "number") {
      output.push(value);
      return;
    }

    value.forEach((item) => collectCoordinates(item, output));
  }

  function addOfficeMarker() {
    if (!config.office || !config.office.enabled || !state.map) return;
    addOfficeOverlayMarker();
  }

  function addOfficeOverlayMarker() {
    if (state.officeOverlayMarker) {
      updateOfficeOverlayMarker();
      return;
    }

    const marker = document.createElement("button");
    marker.className = "office-overlay-marker";
    marker.type = "button";
    marker.title = config.office.name || "LGeo HQ";
    marker.setAttribute("aria-label", config.office.name || "LGeo HQ");

    const image = document.createElement("img");
    image.src = config.office.logoUrl;
    image.alt = "";

    marker.append(image);

    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      showOfficePopup();
    });

    document.querySelector(".map-stage").append(marker);
    state.officeOverlayMarker = marker;

    state.map.on("move", updateOfficeOverlayMarker);
    state.map.on("zoom", updateOfficeOverlayMarker);

    updateOfficeOverlayMarker();
  }

  function updateOfficeOverlayMarker() {
    if (!state.map || !state.officeOverlayMarker || !config.office || !config.office.coordinates) return;

    const point = state.map.project(config.office.coordinates);
    const canvas = state.map.getCanvas();
    const minzoom = Number(config.office.minzoom || 9);

    const visible =
      state.map.getZoom() >= minzoom &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= canvas.clientWidth &&
      point.y <= canvas.clientHeight;

    state.officeOverlayMarker.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -100%)`;
    state.officeOverlayMarker.hidden = !visible;
  }

  function zoomToOffice() {
    if (!state.map || !config.office || !config.office.enabled || !config.office.coordinates) return;

    state.map.stop();
    state.map.easeTo({
      center: config.office.coordinates,
      zoom: Math.max(state.map.getZoom(), 13.5),
      duration: 700,
      essential: true
    });
  }

  function showOfficePopup() {
    if (!state.map || !config.office || !config.office.coordinates) return;
    replaceActivePopup(officePopupLngLat(), officePopupHtml());
  }

  function officePopupLngLat() {
    if (!state.officeOverlayMarker) return config.office.coordinates;

    const point = state.map.project(config.office.coordinates);
    const markerHeight = state.officeOverlayMarker.getBoundingClientRect().height || 44;

    return state.map.unproject([point.x, point.y - markerHeight - 10]);
  }

  function officePopupHtml() {
    const games = Array.isArray(config.office.games) ? config.office.games : [];
    const gameLinks = games
      .map((game) => `
        <a class="office-game-link" href="${escapeAttribute(game.url)}" target="_blank" rel="noopener">
          ${escapeHtml(game.label)}
        </a>
      `)
      .join("");

    return `
      <div class="office-popup">
        <h3 class="popup-title">Oh, hi there!</h3>
        <p class="office-popup-copy">You found our office! As a reward, here are our favorite geography games:</p>
        <div class="office-game-list">${gameLinks}</div>
      </div>
    `;
  }

  function fitStartupBounds(animated) {
    if (!state.map || !config.mapbox.startupBounds) return;

    state.map.stop();
    state.map.fitBounds(config.mapbox.startupBounds, {
      padding: 28,
      duration: animated ? 700 : 0,
      essential: true
    });
  }

  function displayGeographyName(name) {
    return String(name || "")
      .replace(/\s+-\s+British Columbia$/i, "")
      .replace(/\s+-\s+Alberta$/i, "")
      .replace(/\s+-\s+Ontario$/i, "")
      .replace(/\s+-\s+Canada$/i, "")
      .trim();
  }

  function scoreSearchEntry(entry) {
    const scaleScore = {
      Municipal: 4,
      Regional: 3,
      Provincial: 2,
      National: 1
    };

    const bestScale = Math.max(0, ...(entry.scales || []).map((scale) => scaleScore[scale] || 0));
    const shorterNameBonus = Math.max(0, 80 - entry.name.length) / 100;
    const directBonus = entry.directCount ? 100 : 0;

    return directBonus + entry.projectCount + bestScale + shorterNameBonus;
  }

  function countBy(items, key) {
    return items.reduce((counts, item) => {
      const value = item[key] || "Uncategorized";
      counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {});
  }

  function formatProjectCount(count) {
    const number = Number(count || 0);
    return `${number.toLocaleString()} ${number === 1 ? "project" : "projects"}`;
  }

  function setStatus(text) {
    if (!els.mapStatus) return;
    els.mapStatus.style.display = "block";
    els.mapStatus.textContent = text;
  }

  function hideReadyStatus() {
    window.setTimeout(() => {
      if (els.mapStatus) {
        els.mapStatus.style.display = "none";
        els.mapStatus.textContent = "";
      }
    }, 1200);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();