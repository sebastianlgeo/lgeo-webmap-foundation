(function () {
  const config = window.WEBMAP_CONFIG;

  const state = {
    map: null,
    hoverPopup: null,
    activePopup: null,
    officeLayerEventsBound: false,
    lastPopupClick: "",
    activePopupMeta: null,
    theme: "day",
    projects: [],
    projectsByNumber: new Map(),
    geographyIndex: {},
    geographyLookup: new Map(),
    geographyBoundsIndex: {},
    featureNameSets: new Map(),
    featureLookup: new Map(),
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
      closeActivePopup();
      hideHoverLabel();
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
    const [projects, geographyIndex, geographyBoundsIndex] = await Promise.all([
      fetchData(config.data.projectsUrl, "projects"),
      fetchData(config.data.geographyIndexUrl, "geographyIndex"),
      fetchOptionalData(config.data.geographyBoundsUrl, "geographyBounds")
    ]);

    state.projects = projects;
    state.projectsByNumber = new Map(
      projects.map((project) => [String(project.projectNumber || ""), project])
    );

    state.geographyIndex = geographyIndex;
    state.geographyBoundsIndex = geographyBoundsIndex || {};
    state.geographyLookup = new Map(
      Object.keys(geographyIndex).map((name) => [normalizeGeography(name), geographyIndex[name]])
    );
    buildFeatureNameSets();
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

  async function fetchOptionalData(url, fallbackKey) {
    if (!url) return null;
    try {
      return await fetchData(url, fallbackKey);
    } catch (_error) {
      return null;
    }
  }

  function structuredCloneSafe(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function buildFeatureNameSets() {
    const boundsIndex = state.geographyBoundsIndex || {};
    const featureNamesByLayer = boundsIndex.featureNamesByLayer || {};
    const entries = boundsIndex.entries || {};
    state.featureNameSets = new Map();
    state.featureLookup = new Map();

    config.layers.forEach((layer) => {
      const names = new Set((featureNamesByLayer[layer.id] || []).map(normalizeGeography));
      state.featureNameSets.set(layer.id, names);
    });

    Object.entries(entries).forEach(([name, entry]) => {
      state.featureLookup.set(normalizeGeography(name), entry);
    });
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

  function lockMapOrientation() {
    if (!state.map) return;
    if (state.map.dragRotate && state.map.dragRotate.disable) state.map.dragRotate.disable();
    if (state.map.touchZoomRotate && state.map.touchZoomRotate.disableRotation) {
      state.map.touchZoomRotate.disableRotation();
    }
    if (state.map.getBearing && Math.abs(state.map.getBearing()) > 0.01) state.map.setBearing(0);
    if (state.map.getPitch && Math.abs(state.map.getPitch()) > 0.01) state.map.setPitch(0);
  }

  function startMap(token) {
    mapboxgl.accessToken = token;

    state.map = new mapboxgl.Map({
      container: "map",
      style: getStyleUrl(),
      center: config.mapbox.center,
      zoom: config.mapbox.zoom,
      bearing: 0,
      pitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      maxBounds: config.mapbox.maxBounds,
      attributionControl: true
    });

    window.__lgeoMap = state.map;
    window.__lgeoState = state;

    lockMapOrientation();
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

    state.map.on("mousemove", (event) => {
      if (!hasRenderedHoverCircle(event.point)) hideHoverLabel();
    });
    state.map.on("rotate", lockMapOrientation);
    state.map.on("pitch", lockMapOrientation);
    state.map.on("movestart", hideHoverLabel);
    state.map.on("zoomstart", hideHoverLabel);
    state.map.on("zoomend", closePopupOutsideZoomRange);

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
    addMapSource(layer);

    if (layer.kind === "polygon") {
      addPolygonLayers(layer);
    } else {
      addPointLayers(layer);
    }
  }

  function addMapSource(layer) {
    if (state.map.getSource(layer.id)) return;

    if (usesLocalGeojson(layer)) {
      state.map.addSource(layer.id, {
        type: "geojson",
        data: `${config.data.geojsonBaseUrl}${layer.id}.geojson`
      });
      return;
    }

    state.map.addSource(layer.id, {
      type: "vector",
      url: layer.tilesetUrl,
      volatile: true
    });
  }

  function usesLocalGeojson(layer) {
    return Boolean(config.data.useLocalGeojson) || layer.sourceType === "geojson";
  }

  function addMapLayer(layer, spec) {
    if (!usesLocalGeojson(layer)) spec["source-layer"] = layer.sourceLayer;
    state.map.addLayer(spec);
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

  function visibleFeatureFilter(layer) {
    const hiddenNames = hiddenPointNamesForLayer(layer);
    if (!hiddenNames.length) return hasProjectsFilter();
    return [
      "all",
      hasProjectsFilter(),
      ["!", ["in", ["get", "NameKey"], ["literal", hiddenNames]]]
    ];
  }

  function hiddenPointNamesForLayer(layer) {
    if (!layer || layer.kind !== "point") return [];
    const hidden = config.hiddenPointGeographies || {};
    const byScale = hidden[capitalize(layer.scale)] || hidden[layer.scale] || [];
    return Array.isArray(byScale) ? byScale : [];
  }

  function lowerScaleReplacementFilter(layer, value) {
    return ["==", metricMatchExpression(replacementMetricName(layer), true), value];
  }

  function promoteFromProvinceFilter(layer, value) {
    return ["==", metricMatchExpression(promotionMetricName(layer), false), value];
  }

  function replacementMetricName(layer) {
    return layer && layer.kind === "polygon" ? "hasLowerPolygonReplacement" : "hasLowerPointReplacement";
  }

  function promotionMetricName(layer) {
    return layer && layer.kind === "polygon" ? "promotePolygonFromProvince" : "promotePointFromProvince";
  }

  function addPolygonLayers(layer) {
    if (!state.map.getLayer(layer.id)) {
      addMapLayer(layer, {
        id: layer.id,
        type: "fill",
        source: layer.id,
        minzoom: layer.minzoom,
        maxzoom: layer.maxzoom,
        paint: {
          "fill-color": polygonFillColor(layer),
          "fill-opacity": [
            "case",
            hasProjectsFilter(),
            0.38,
            0
          ]
        },
        filter: visibleFeatureFilter(layer)
      });
    }

    const lineId = `${layer.id}-line`;
    if (!state.map.getLayer(lineId)) {
      addMapLayer(layer, {
        id: lineId,
        type: "line",
        source: layer.id,
        minzoom: layer.minzoom,
        maxzoom: layer.maxzoom,
        paint: {
          "line-color": polygonLineColor(),
          "line-opacity": 0.72,
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
        filter: visibleFeatureFilter(layer)
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
      addMapLayer(layer, {
        id: fillId,
        type: "fill",
        source: layer.id,
        minzoom: layer.maxzoom,
        maxzoom: 24,
        paint: {
          "fill-color": polygonFillColor(layer),
          "fill-opacity": 0.24
        },
        filter: [
          "all",
          visibleFeatureFilter(layer),
          lowerScaleReplacementFilter(layer, false)
        ]
      });
    }

    if (!state.map.getLayer(lineId)) {
      addMapLayer(layer, {
        id: lineId,
        type: "line",
        source: layer.id,
        minzoom: layer.maxzoom,
        maxzoom: 24,
        paint: {
          "line-color": polygonLineColor(),
          "line-opacity": 0.72,
          "line-width": 1.35
        },
        filter: [
          "all",
          visibleFeatureFilter(layer),
          lowerScaleReplacementFilter(layer, false)
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
      addMapLayer(layer, {
        id: fillId,
        type: "fill",
        source: layer.id,
        minzoom,
        maxzoom: layer.minzoom,
        paint: {
          "fill-color": polygonFillColor(layer),
          "fill-opacity": 0.34
        },
        filter: [
          "all",
          visibleFeatureFilter(layer),
          promoteFromProvinceFilter(layer, true)
        ]
      });
    }

    if (!state.map.getLayer(lineId)) {
      addMapLayer(layer, {
        id: lineId,
        type: "line",
        source: layer.id,
        minzoom,
        maxzoom: layer.minzoom,
        paint: {
          "line-color": polygonLineColor(),
          "line-opacity": 0.72,
          "line-width": 1.25
        },
        filter: [
          "all",
          visibleFeatureFilter(layer),
          promoteFromProvinceFilter(layer, true)
        ]
      });
    }
  }

  function addPointLayers(layer) {
    const circleId = `${layer.id}-circle`;
    const labelId = `${layer.id}-circle-label`;
    const displayMinzoom = layer.minzoom;
    const displayMaxzoom = layer.maxzoom;

    if (!state.map.getLayer(circleId)) {
      addMapLayer(layer, {
        id: circleId,
        type: "circle",
        source: layer.id,
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
        filter: visibleFeatureFilter(layer)
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
      addMapLayer(layer, {
        id: labelId,
        type: "symbol",
        source: layer.id,
        minzoom: displayMinzoom,
        maxzoom: displayMaxzoom,
        layout: countLabelLayout(),
        paint: countLabelPaint(layer),
        filter: visibleFeatureFilter(layer)
      });
    }

    bindClick(layer, circleId);
  }

  function addPointContinuationLayers(layer, circlePaint) {
    if (layer.scale !== "provincial" && layer.scale !== "regional") return;

    const circleId = `${layer.id}-continuation-circle`;
    const labelId = `${layer.id}-continuation-circle-label`;

    if (!state.map.getLayer(circleId)) {
      addMapLayer(layer, {
        id: circleId,
        type: "circle",
        source: layer.id,
        minzoom: layer.maxzoom,
        maxzoom: 24,
        paint: circlePaint,
        filter: [
          "all",
          visibleFeatureFilter(layer),
          lowerScaleReplacementFilter(layer, false)
        ]
      });
    }

    if (!state.map.getLayer(labelId)) {
      addMapLayer(layer, {
        id: labelId,
        type: "symbol",
        source: layer.id,
        minzoom: layer.maxzoom,
        maxzoom: 24,
        layout: countLabelLayout(),
        paint: countLabelPaint(),
        filter: [
          "all",
          visibleFeatureFilter(layer),
          lowerScaleReplacementFilter(layer, false)
        ]
      });
    }

    bindClick(layer, circleId);
  }

  function addPromotedMunicipalPointLayers(layer, circlePaint) {
    if (layer.scale !== "municipal") return;

    const circleId = `${layer.id}-promoted-circle`;
    const labelId = `${layer.id}-promoted-circle-label`;
    const minzoom = promotedMunicipalMinzoom();

    if (!state.map.getLayer(circleId)) {
      addMapLayer(layer, {
        id: circleId,
        type: "circle",
        source: layer.id,
        minzoom,
        maxzoom: layer.minzoom,
        paint: circlePaint,
        filter: [
          "all",
          visibleFeatureFilter(layer),
          promoteFromProvinceFilter(layer, true)
        ]
      });
    }

    if (!state.map.getLayer(labelId)) {
      addMapLayer(layer, {
        id: labelId,
        type: "symbol",
        source: layer.id,
        minzoom,
        maxzoom: layer.minzoom,
        layout: countLabelLayout(),
        paint: countLabelPaint(),
        filter: [
          "all",
          visibleFeatureFilter(layer),
          promoteFromProvinceFilter(layer, true)
        ]
      });
    }

    bindClick(layer, circleId, { hover: false });
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
    return baseOpacity;
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
      const configLayer = findConfigLayerFromMapLayerId(id);

      if (id.includes("continuation")) {
        state.map.setFilter(id, ["all", visibleFeatureFilter(configLayer), lowerScaleReplacementFilter(configLayer, false)]);
      } else if (id.includes("promoted")) {
        state.map.setFilter(id, ["all", visibleFeatureFilter(configLayer), promoteFromProvinceFilter(configLayer, true)]);
      } else {
        state.map.setFilter(id, visibleFeatureFilter(configLayer));
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
    return config.layers.find((layer) => String(mapLayerId || "").startsWith(layer.id)) || {};
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
        hasLowerPointReplacement: hasLowerScaleReplacementFromIndex(nameKey, filteredProjects, "point"),
        hasLowerPolygonReplacement: hasLowerScaleReplacementFromIndex(nameKey, filteredProjects, "polygon"),
        promotePointFromProvince: shouldPromoteFromProvinceFromIndex(nameKey, filteredProjects, "point"),
        promotePolygonFromProvince: shouldPromoteFromProvinceFromIndex(nameKey, filteredProjects, "polygon")
      });
    });
  }

  function getFilteredProjectsForGeography(nameKey) {
    const canonicalName = canonicalGeographyName(nameKey);
    const geographyNames = uniqueNames([
      canonicalName,
      nameKey,
      ...getGeographyAliases(canonicalName),
      ...getGeographyAliases(nameKey)
    ]);
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

  function hasLowerScaleReplacementFromIndex(nameKey, filteredProjects, kind) {
    const scales = featureScalesForName(nameKey, kind);

    const lowerScales = scales.includes("Provincial")
      ? ["Regional", "Municipal"]
      : scales.includes("Regional")
        ? ["Municipal"]
        : [];
    if (!lowerScales.length) return true;

    const hasNamedLowerReplacement = filteredProjects.some((projectSummary) => {
      const project = state.projectsByNumber.get(String(projectSummary.projectNumber || ""));
      return project && hasFeatureForProjectAtAnyLayerScale(project, lowerScales, lowerScales, kind);
    });
    if (hasNamedLowerReplacement) return true;

    return hasEquivalentLowerScaleFeature(filteredProjects, lowerScales, kind);
  }

  function hasEquivalentLowerScaleFeature(filteredProjects, lowerScales, kind) {
    const targetProjects = projectNumberSet(filteredProjects);
    if (!targetProjects.size) return false;

    return Object.values(state.geographyIndex).some((entry) => {
      if (!entry || !Array.isArray(entry.scales) || !Array.isArray(entry.projects)) return false;
      if (!entry.scales.some((scale) => lowerScales.includes(scale))) return false;

      const entryName = entry.geographyName;
      if (!hasFeatureAtAnyLayerScale(entryName, lowerScales, kind)) return false;
      return sameProjectNumberSet(targetProjects, projectNumberSet(entry.projects));
    });
  }

  function hasFeatureAtAnyLayerScale(nameKey, layerScales, kind) {
    const normalizedName = normalizeGeography(nameKey);
    return config.layers
      .filter((layer) => layer.kind === kind && layerScales.includes(capitalize(layer.scale)))
      .some((layer) => (state.featureNameSets.get(layer.id) || new Set()).has(normalizedName));
  }

  function projectNumberSet(projects) {
    return new Set(
      (projects || [])
        .map((project) => String(project.projectNumber || ""))
        .filter(Boolean)
    );
  }

  function sameProjectNumberSet(left, right) {
    if (left.size !== right.size) return false;
    for (const value of left) {
      if (!right.has(value)) return false;
    }
    return true;
  }

  function shouldPromoteFromProvinceFromIndex(nameKey, filteredProjects, kind) {
    const scales = featureScalesForName(nameKey, kind);
    if (!scales.includes("Municipal") || !filteredProjects.length) return false;

    return filteredProjects.some((projectSummary) => {
      const project = state.projectsByNumber.get(String(projectSummary.projectNumber || ""));
      if (!project || !getProjectScaleNames(project, "Provincial").length) return false;
      return !hasFeatureForProjectNamesAtLayerScale(project, ["Regional", "Municipal"], "Regional", kind);
    });
  }

  function featureScalesForName(nameKey, kind) {
    const normalizedName = normalizeGeography(nameKey);
    return config.layers
      .filter((layer) => layer.kind === kind)
      .filter((layer) => (state.featureNameSets.get(layer.id) || new Set()).has(normalizedName))
      .map((layer) => capitalize(layer.scale));
  }

  function hasFeatureForProjectScale(project, scale, kind) {
    return hasFeatureForProjectNamesAtLayerScale(project, [scale], scale, kind);
  }

  function hasFeatureForProjectAtAnyLayerScale(project, nameScales, layerScales, kind) {
    return layerScales.some((layerScale) =>
      hasFeatureForProjectNamesAtLayerScale(project, nameScales, layerScale, kind)
    );
  }

  function hasFeatureForProjectNamesAtLayerScale(project, nameScales, layerScale, kind) {
    const matchingLayers = config.layers
      .filter((layer) => layer.kind === kind && capitalize(layer.scale) === layerScale);
    const layerIds = matchingLayers.map((layer) => layer.id);

    if (!layerIds.length) return false;

    const featureNames = new Set(
      matchingLayers.flatMap((layer) => {
        const hiddenNames = new Set(hiddenPointNamesForLayer(layer).map(normalizeGeography));
        return Array.from(state.featureNameSets.get(layer.id) || [])
          .filter((name) => !hiddenNames.has(normalizeGeography(name)));
      })
    );

    return nameScales.flatMap((scale) => getProjectScaleNames(project, scale))
      .map(normalizeGeography)
      .some((name) => featureNames.has(name));
  }

  function legacyHasLowerScaleReplacementFromIndex(nameKey, filteredProjects) {
    const entry = getGeographyIndexEntry(nameKey);
    const scales = entry && entry.scales ? entry.scales.map(String) : [];

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

  function bindClick(layer, mapLayerId, options = {}) {
    if (state.map.__lgeoBoundLayers && state.map.__lgeoBoundLayers.has(mapLayerId)) return;

    state.map.__lgeoBoundLayers = state.map.__lgeoBoundLayers || new Set();
    state.map.__lgeoBoundLayers.add(mapLayerId);

    state.map.on("click", mapLayerId, (event) => {
      if (isDuplicatePopupClick(event)) return;
      const feature = event.features && event.features[0];
      if (feature) showPopup(feature, event.lngLat, layer, mapLayerId);
    });

    if (options.hover === false) return;

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
    const mapLayerId = event.features && event.features[0] && event.features[0].layer && event.features[0].layer.id;
    const layer = findConfigLayerFromMapLayerId(mapLayerId);
    if (!layer || layer.kind !== "point" || String(mapLayerId || "").includes("promoted")) return;
    if (!hoverLayerStableAtCurrentZoom(mapLayerId, layer)) {
      hideHoverLabel();
      return;
    }
    if (!hasRenderedHoverCircle(event.point, mapLayerId, name)) return;
    const anchor = pointAnchorForFeature(name, feature, layer) || event.lngLat;

    if (!state.hoverPopup) {
      state.hoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "hover-popup",
        offset: 14
      });
    }

    state.hoverPopup
      .setLngLat(anchor)
      .setHTML(`<span>${escapeHtml(displayGeographyName(name))}</span>`)
      .addTo(state.map);
  }

  function hasRenderedHoverCircle(point, mapLayerId, name) {
    if (!state.map || !point) return false;
    const hoverLayers = hoverablePointCircleLayers();
    if (!hoverLayers.length) return false;

    const layers = mapLayerId ? [mapLayerId].filter((id) => hoverLayers.includes(id)) : hoverLayers;
    if (!layers.length) return false;

    return state.map.queryRenderedFeatures(point, { layers }).some((feature) => {
      const featureLayerId = feature.layer && feature.layer.id;
      const featureLayer = findConfigLayerFromMapLayerId(featureLayerId);
      if (!hoverLayerStableAtCurrentZoom(featureLayerId, featureLayer)) return false;
      if (name && !sameGeography(feature.properties && feature.properties.NameKey, name)) return false;
      return true;
    });
  }

  function hoverablePointCircleLayers() {
    if (!state.map) return [];
    return config.layers
      .filter((layer) => layer.kind === "point")
      .flatMap((layer) => [`${layer.id}-circle`, `${layer.id}-continuation-circle`])
      .filter((id) => state.map.getLayer(id));
  }

  function hoverLayerStableAtCurrentZoom(mapLayerId, layer) {
    if (!state.map || !mapLayerId || !layer || layer.kind !== "point") return false;
    if (String(mapLayerId).includes("promoted")) return false;

    const zoom = state.map.getZoom();
    const enterBuffer = hoverZoomBufferFor(layer, "enter");
    const exitBuffer = hoverZoomBufferFor(layer, "exit");

    if (String(mapLayerId).includes("continuation")) {
      return zoom >= Number(layer.maxzoom || 24) + hoverZoomBufferFor(layer, "continuationEnter");
    }

    const minZoom = Number(layer.minzoom || 0);
    const maxZoom = Number(layer.maxzoom || 24);
    const stableMin = minZoom > 0 ? minZoom + enterBuffer : minZoom;
    const stableMax = maxZoom >= 24 ? maxZoom : maxZoom - exitBuffer;
    return zoom >= stableMin && zoom < stableMax;
  }

  function hoverZoomBufferFor(layer, mode) {
    const configValue = config.mapbox.hoverZoomBuffer;
    if (typeof configValue === "number") return configValue;

    const buffers = configValue || {};
    const scale = String(layer && layer.scale || "").toLowerCase();
    const scaleKey = `${scale}${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;

    if (Number.isFinite(Number(buffers[scaleKey]))) return Number(buffers[scaleKey]);
    if (Number.isFinite(Number(buffers[mode]))) return Number(buffers[mode]);
    if (mode === "enter" && Number.isFinite(Number(buffers.defaultEnter))) return Number(buffers.defaultEnter);
    if (mode === "exit" && Number.isFinite(Number(buffers.defaultExit))) return Number(buffers.defaultExit);
    if (mode === "continuationEnter" && Number.isFinite(Number(buffers.continuationEnter))) {
      return Number(buffers.continuationEnter);
    }
    return 0;
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

  function replaceActivePopup(lngLat, html, meta) {
    hideHoverLabel();
    closeActivePopup();

    const popup = new mapboxgl.Popup({
      anchor: "bottom",
      closeButton: true,
      maxWidth: "320px",
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
    state.activePopupMeta = meta || null;
    popup.on("close", () => {
      if (document.activeElement === closeButton) {
        closeButton.blur();
      }

      if (state.activePopup === popup) {
        state.activePopup = null;
        state.activePopupMeta = null;
      }
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
      state.activePopupMeta = null;
      popup.remove();
    }
  }

  function closePopupOutsideZoomRange() {
    if (!state.activePopup || !state.activePopupMeta) return;
    if (state.activePopupMeta.ignoreNextZoomEnd) {
      state.activePopupMeta.ignoreNextZoomEnd = false;
      return;
    }

    const zoom = state.map.getZoom();
    const minZoom = Number(state.activePopupMeta.minZoom || 0);
    const maxZoom = Number(state.activePopupMeta.maxZoom || 24);
    if (zoom < minZoom || zoom >= maxZoom) closeActivePopup();
  }

  function showPopup(feature, lngLat, layer, mapLayerId) {
    hideHoverLabel();

    const name = canonicalGeographyName(feature.properties.NameKey);
    const projects = getFilteredProjectsForGeography(name);
    const linkedCount = projects.filter((project) => project.projectUrl).length;
    const zoomTarget = findGeographyBoundsEntry(name) || feature;
    const popupAnchor = pointAnchorForFeature(name, feature, layer) || lngLat;
    const scale = capitalize(layer && layer.scale) || scaleForGeography(name);

    zoomToGeography(name, zoomTarget, { scale, revealNext: isNationalGeography(name) });

    if (!projects.length || !shouldOpenPopupForGeography(name)) {
      closeActivePopup();
      return;
    }

    replaceActivePopup(popupAnchor, popupHtml(name, projects, linkedCount), popupMetaForLayer(layer, mapLayerId));
    keepPopupThroughAutomatedZoom();
  }

  function showPopupForGeography(name) {
    if (!state.map) return;
    name = canonicalGeographyName(name);

    const projects = getFilteredProjectsForGeography(name);
    const linkedCount = projects.filter((project) => project.projectUrl).length;
    const zoomTarget = findGeographyBoundsEntry(name);
    const scale = scaleForGeography(name);
    const popupAnchor = pointAnchorForGeography(name, scale);

    const fallbackPoint = zoomToGeography(name, zoomTarget, { scale, revealNext: isNationalGeography(name) }) || state.map.getCenter();

    if (!projects.length || !shouldOpenPopupForGeography(name)) {
      closeActivePopup();
      return;
    }

    replaceActivePopup(popupAnchor || fallbackPoint, popupHtml(name, projects, linkedCount), popupMetaForScale(scale));
    keepPopupThroughAutomatedZoom();
  }

  function keepPopupThroughAutomatedZoom() {
    if (!state.activePopupMeta || !state.map || !state.map.isMoving()) return;
    state.activePopupMeta.ignoreNextZoomEnd = true;
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
            <a class="${rowClass} popup-project-card-link" href="${escapeAttribute(project.projectUrl)}" target="_top">
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
      <h3 class="popup-title">${escapeHtml(displayGeographyName(name))}</h3>
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
    const merged = new Map();

    Object.values(state.geographyIndex).forEach((entry) => {
      const canonicalName = canonicalGeographyName(entry.geographyName);
      const metrics = state.geographyMetrics.get(canonicalName) || state.geographyMetrics.get(entry.geographyName) || {};
      const displayName = displayGeographyName(canonicalName);
      const dedupeKey = normalizeGeography(displayName);
      const candidate = {
        name: canonicalName,
        displayName,
        projectCount: metrics.projectCount || 0,
        directCount: getDirectProjectsForGeography(canonicalName).length,
        scales: Array.from(new Set([
          ...(getGeographyIndexEntry(canonicalName)?.scales || []),
          ...(entry.scales || [])
        ]))
      };

      const existing = merged.get(dedupeKey);
      if (!existing || scoreSearchEntry(candidate) > scoreSearchEntry(existing)) {
        merged.set(dedupeKey, candidate);
      }
    });

    return Array.from(merged.values());
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

  function uniqueNames(names) {
    const seen = new Set();
    return names.filter((name) => {
      const key = normalizeGeography(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getGeographyIndexEntry(nameKey) {
    const canonicalName = canonicalGeographyName(nameKey);
    return state.geographyIndex[canonicalName] ||
      state.geographyIndex[nameKey] ||
      state.geographyLookup.get(normalizeGeography(canonicalName)) ||
      state.geographyLookup.get(normalizeGeography(nameKey));
  }

  function getGeographyAliases(nameKey) {
    const aliases = config.geographyAliases || {};
    const canonicalName = canonicalGeographyName(nameKey);
    const directAliases = aliases[canonicalName] || aliases[nameKey];
    if (directAliases) return directAliases;

    const matchedName = Object.keys(aliases).find((name) => sameGeography(name, canonicalName));
    return matchedName ? aliases[matchedName] : [];
  }

  function canonicalGeographyName(nameKey) {
    const canonical = config.canonicalGeographies || {};
    const matchedName = Object.keys(canonical).find((name) => sameGeography(name, nameKey));
    return matchedName ? canonical[matchedName] : nameKey;
  }

  function findGeographyBoundsEntry(nameKey) {
    const canonicalName = canonicalGeographyName(nameKey);
    const names = [canonicalName, nameKey, ...getGeographyAliases(canonicalName)].map(normalizeGeography);
    for (const name of names) {
      const entry = state.featureLookup.get(name);
      if (entry) return entry;
    }
    return null;
  }

  function pointAnchorForFeature(nameKey, feature, layer) {
    if (feature && feature.geometry && feature.geometry.type === "Point") {
      return centerForCoordinates(feature.geometry.coordinates);
    }
    return pointAnchorForGeography(nameKey, capitalize(layer && layer.scale));
  }

  function pointAnchorForGeography(nameKey, scale) {
    const entry = findGeographyBoundsEntry(nameKey);
    if (!entry || !Array.isArray(entry.features)) return null;

    const requestedScale = scale || scaleForGeography(nameKey);
    const pointFeature = entry.features.find((feature) =>
      feature.kind === "point" && capitalize(feature.scale) === requestedScale
    ) || entry.features.find((feature) => feature.kind === "point");

    return pointFeature && pointFeature.center ? pointFeature.center : null;
  }

  function scaleForGeography(nameKey) {
    if (isNationalGeography(nameKey)) return "National";

    const entry = findGeographyBoundsEntry(nameKey);
    const pointScale = broadestPointScale(entry);
    if (pointScale) return pointScale;
    if (entry && entry.preferredScale) return capitalize(entry.preferredScale);

    const indexEntry = getGeographyIndexEntry(nameKey);
    const scales = indexEntry && indexEntry.scales ? indexEntry.scales : [];
    return ["Municipal", "Regional", "Provincial", "National"].find((scale) => scales.includes(scale)) || "";
  }

  function broadestPointScale(entry) {
    if (!entry || !Array.isArray(entry.features)) return "";
    const pointScales = new Set(
      entry.features
        .filter((feature) => feature.kind === "point")
        .map((feature) => capitalize(feature.scale))
        .filter(Boolean)
    );
    return ["National", "Provincial", "Regional", "Municipal"].find((scale) => pointScales.has(scale)) || "";
  }

  function popupMetaForScale(scale) {
    const range = zoomRangeForScale(scale);
    if (!range) return null;
    const nationalLinger = scale === "National" ? 0.55 : 0.02;
    return {
      minZoom: range.min,
      maxZoom: range.max + nationalLinger
    };
  }

  function popupMetaForLayer(layer, mapLayerId) {
    const scale = capitalize(layer && layer.scale);
    if (!layer || !scale) return popupMetaForScale(scale);

    const id = String(mapLayerId || "");
    const nationalLinger = scale === "National" ? 0.55 : 0.02;
    const minZoom = id.includes("continuation")
      ? layer.maxzoom
      : id.includes("promoted")
        ? promotedMunicipalMinzoom()
        : layer.minzoom;
    const maxZoom = id.includes("continuation")
      ? 24
      : id.includes("promoted")
        ? layer.minzoom
        : layer.maxzoom;

    return {
      minZoom: Number(minZoom || 0),
      maxZoom: Number(maxZoom || 24) + nationalLinger
    };
  }

  function zoomRangeForScale(scale) {
    const normalizedScale = capitalize(scale);
    const layer = config.layers.find((item) => capitalize(item.scale) === normalizedScale && item.kind === "point")
      || config.layers.find((item) => capitalize(item.scale) === normalizedScale);
    if (!layer) return null;
    return { min: layer.minzoom || 0, max: layer.maxzoom || 24 };
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

  function capitalize(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
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

  function zoomToGeography(name, target, options = {}) {
    const scale = options.scale || scaleForGeography(name);
    const namedBounds = boundsForNamedGeography(name);
    if (namedBounds) {
      state.map.stop();
      const padding = config.mapbox.boundsPadding;
      const camera = state.map.cameraForBounds(namedBounds.bounds, { padding });

      if (!camera) {
        state.map.fitBounds(namedBounds.bounds, {
          padding,
          maxZoom: targetMaxZoomForScale(scale, options),
          duration: 500,
          essential: true
        });
        return namedBounds.bounds.getCenter();
      }

      const zoom = clampZoomToScale(camera.zoom || state.map.getZoom(), scale, options, namedBounds);
      state.map.easeTo({
        center: camera.center,
        zoom,
        duration: 500,
        essential: true
      });
      return camera.center;
    }

    const boundsInfo = boundsInfoForTarget(target);
    if (boundsInfo) return zoomToBoundsInfo(boundsInfo, scale, options);
    return null;
  }

  function zoomToBoundsInfo(boundsInfo, scale, options = {}) {
    if (boundsInfo.isPoint) {
      state.map.stop();
      state.map.easeTo({
        center: boundsInfo.center,
        zoom: targetMinZoomForScale(scale, options),
        duration: 450,
        essential: true
      });
      return boundsInfo.center;
    }

    state.map.stop();
    state.map.fitBounds(boundsInfo.bounds, {
      padding: config.mapbox.boundsPadding,
      maxZoom: targetMaxZoomForScale(scale, options),
      duration: 500,
      essential: true
    });
    return boundsInfo.bounds.getCenter();
  }

  function clampZoomToScale(zoom, scale, options, namedBounds) {
    const minZoom = namedBounds && namedBounds.minZoom
      ? namedBounds.minZoom
      : targetMinZoomForScale(scale, options);
    const maxZoom = namedBounds && namedBounds.maxZoom
      ? namedBounds.maxZoom
      : targetMaxZoomForScale(scale, options);
    return Math.min(Math.max(zoom, minZoom), maxZoom);
  }

  function targetMinZoomForScale(scale, options = {}) {
    if (options.revealNext && scale === "National") {
      return zoomRangeForScale("Provincial").min + 0.02;
    }
    const range = zoomRangeForScale(scale);
    return range ? range.min + 0.02 : state.map.getZoom();
  }

  function targetMaxZoomForScale(scale, options = {}) {
    if (options.revealNext && scale === "National") {
      return zoomRangeForScale("Provincial").min + 0.35;
    }
    const range = zoomRangeForScale(scale);
    if (!range) return 9.5;
    if (scale === "Municipal") return 10.9;
    return range.max >= 24 ? 12 : range.max - 0.04;
  }

  function boundsInfoForTarget(target) {
    if (!target) return null;
    if (target.geometry) return boundsForGeometry(target.geometry);
    if (target.bounds) {
      return {
        isPoint: false,
        bounds: new mapboxgl.LngLatBounds(target.bounds[0], target.bounds[1])
      };
    }
    if (Array.isArray(target) && target.length >= 2) {
      return { isPoint: true, center: target };
    }
    return null;
  }

  function centerForCoordinates(coordinates) {
    if (!coordinates) return null;
    if (Array.isArray(coordinates)) return coordinates;
    if (typeof coordinates.lng === "number" && typeof coordinates.lat === "number") {
      return [coordinates.lng, coordinates.lat];
    }
    return null;
  }

  function boundsForNamedGeography(name) {
    const namedBounds = {
      ...(config.mapbox.countryBounds || {}),
      ...(config.geographyBounds || {})
    };

    const matchedName = Object.keys(namedBounds).find((boundsName) => sameGeography(boundsName, name));
    if (!matchedName) return null;

    const bounds = namedBounds[matchedName];
    const minZooms = {
      ...(config.mapbox.countryMinZoom || {}),
      ...(config.geographyMinZoom || {})
    };
    const maxZooms = config.geographyMaxZoom || {};

    return {
      isPoint: false,
      bounds: new mapboxgl.LngLatBounds(bounds[0], bounds[1]),
      minZoom: minZooms[matchedName] || 0,
      maxZoom: maxZooms[matchedName] || 24
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
    if (!config.office.coordinates || !config.office.logoUrl) return;

    const imageId = officeImageId();
    if (state.map.hasImage(imageId)) {
      addOfficeSymbolLayer(imageId);
      return;
    }

    state.map.loadImage(config.office.logoUrl, (error, image) => {
      if (error || !image || !state.map || !state.styleReady) return;
      if (!state.map.hasImage(imageId)) {
        state.map.addImage(imageId, image);
      }
      addOfficeSymbolLayer(imageId);
    });
  }

  function officeImageId() {
    return "lgeo-office-logo";
  }

  function officeSourceId() {
    return "lgeo-office-source";
  }

  function officeLayerId() {
    return "lgeo-office-symbol";
  }

  function addOfficeSymbolLayer(imageId) {
    const sourceId = officeSourceId();
    const layerId = officeLayerId();

    if (!state.map.getSource(sourceId)) {
      state.map.addSource(sourceId, {
        type: "geojson",
        data: officeFeatureCollection()
      });
    }

    if (!state.map.getLayer(layerId)) {
      state.map.addLayer({
        id: layerId,
        type: "symbol",
        source: sourceId,
        minzoom: Number(config.office.minzoom || 9),
        layout: {
          "icon-image": imageId,
          "icon-size": Number(config.office.iconSize || 0.26),
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
        },
        paint: {
          "icon-opacity": Number(config.office.iconOpacity || 0.78)
        }
      });
    }

    bindOfficeLayerEvents(layerId);
  }

  function officeFeatureCollection() {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            NameKey: config.office.name || "LGeo HQ"
          },
          geometry: {
            type: "Point",
            coordinates: config.office.coordinates
          }
        }
      ]
    };
  }

  function bindOfficeLayerEvents(layerId) {
    if (state.officeLayerEventsBound) return;
    state.officeLayerEventsBound = true;

    state.map.on("click", layerId, (event) => {
      showOfficePopup();
    });

    state.map.on("mouseenter", layerId, () => {
      state.map.getCanvas().style.cursor = "pointer";
      showOfficeHoverLabel();
    });

    state.map.on("mousemove", layerId, showOfficeHoverLabel);

    state.map.on("mouseleave", layerId, () => {
      state.map.getCanvas().style.cursor = "";
      hideHoverLabel();
    });
  }

  function zoomToOffice() {
    if (!state.map || !config.office || !config.office.enabled || !config.office.coordinates) return;

    state.map.stop();
    state.map.flyTo({
      center: config.office.coordinates,
      zoom: Math.max(state.map.getZoom(), 13.5),
      speed: 0.75,
      curve: 1.35,
      duration: 1800,
      essential: true
    });
  }

  function showOfficePopup() {
    if (!state.map || !config.office || !config.office.coordinates) return;
    replaceActivePopup(officePopupLngLat(), officePopupHtml());
  }

  function officePopupLngLat() {
    return config.office.coordinates;
  }

  function showOfficeHoverLabel() {
    if (!state.map || !config.office || !config.office.coordinates) return;

    if (!state.hoverPopup) {
      state.hoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "hover-popup",
        offset: 14
      });
    }

    state.hoverPopup
      .setLngLat(config.office.coordinates)
      .setHTML(`<span>${escapeHtml(config.office.name || "LGeo HQ")}</span>`)
      .addTo(state.map);
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
        <p class="office-popup-copy">You found our office! As a reward, here are our favourite geography games:</p>
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
    const displayNames = config.geographyDisplayNames || {};
    const canonicalName = canonicalGeographyName(name);
    const matchedName = Object.keys(displayNames).find((displayName) => sameGeography(displayName, canonicalName));
    if (matchedName) return displayNames[matchedName];

    return String(canonicalName || "")
      .replace(/^City Of Toronto\s+-\s+Ontario$/i, "Toronto")
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
