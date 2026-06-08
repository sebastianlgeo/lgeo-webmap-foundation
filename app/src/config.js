window.WEBMAP_CONFIG = {
  mapbox: {
    accessToken: window.LGEO_MAPBOX_TOKEN || "",
    // Day mode: paste the current published Mapbox style URL here.
    styleUrl: "mapbox://styles/lickergeospatial/cmpygp42m001v01r9gddo4abx",
    dayStyleUrl: "mapbox://styles/lickergeospatial/cmpygp42m001v01r9gddo4abx",
    // Dark mode: duplicate the Mapbox style, change its colours in Mapbox Studio,
    // publish it, then replace this URL with the duplicated style URL.
    darkStyleUrl: "mapbox://styles/lickergeospatial/cmpzy564w00ew01sy5ebt4274",
    center: [-111.5, 43.4],
    zoom: 3.5,
    boundsPadding: 70,
    hoverZoomBuffer: {
      defaultEnter: 0.06,
      defaultExit: 0.08,
      regionalEnter: 0.04,
      regionalExit: 0.08,
      municipalEnter: 0.32,
      continuationEnter: 0.08
    },
    zoomTransition: 0.2,
    startupBounds: [[-139, 10], [-49, 64]],
    maxBounds: [[-142, 7], [-47, 74]],
    countryBounds: {
      Canada: [[-141, 41.5], [-52, 70]],
      Mexico: [[-118.5, 14], [-86.5, 33]],
      "United States": [[-125, 24], [-66, 50]]
    },
    countryMinZoom: {
      Canada: 3.75,
      Mexico: 3.75,
      "United States": 3.75
    }
  },
  data: {
    useLocalGeojson: true,
    projectsUrl: "../data/processed/projects.json",
    geographyIndexUrl: "../data/processed/geography-index.json",
    geographyBoundsUrl: "../data/processed/geography-bounds.json",
    geojsonBaseUrl: "../data/processed/geojson/"
  },
  geographyAliases: {
    "Toronto - Ontario": ["City Of Toronto - Ontario"],
    "City Of Toronto - Ontario": ["Toronto - Ontario"],
    "Nanaimo Regional District - British Columbia": ["Regional District of Nanaimo - British Columbia"],
    "Regional District of Nanaimo - British Columbia": ["Nanaimo Regional District - British Columbia"],
    "Nanaimo - British Columbia": ["Nanaimo"],
    "Nanaimo": ["Nanaimo - British Columbia"]
  },
  canonicalGeographies: {
    "Toronto - Ontario": "City Of Toronto - Ontario",
    "City Of Toronto - Ontario": "City Of Toronto - Ontario",
    "Nanaimo Regional District - British Columbia": "Regional District of Nanaimo - British Columbia"
  },
  geographyDisplayNames: {
    "Toronto - Ontario": "Toronto",
    "City Of Toronto - Ontario": "Toronto",
    "Regional District of Nanaimo - British Columbia": "Regional District of Nanaimo",
    "Nanaimo Regional District - British Columbia": "Regional District of Nanaimo",
    "Nanaimo - British Columbia": "Nanaimo"
  },
  hiddenPointGeographies: {
    Municipal: ["Halifax - Nova Scotia"]
  },
  geographyBounds: {
    "British Columbia": [[-139.2, 47.9], [-113.1, 60.1]],
    "Alberta": [[-120.2, 48.8], [-109.7, 60.1]],
    "Ontario": [[-95.3, 41.5], [-74.0, 56.9]],
    "New Brunswick": [[-69.2, 44.4], [-63.7, 48.2]],
    "Nova Scotia": [[-66.6, 43.2], [-59.6, 47.2]],
    "Halifax - Nova Scotia": [[-64.6, 44.25], [-62.25, 45.35]],
    "Halifax Regional Municipality - Nova Scotia": [[-64.6, 44.25], [-62.25, 45.35]]
  },
  geographyMinZoom: {
    "British Columbia": 3.75,
    "Alberta": 3.75,
    "Ontario": 3.75,
    "New Brunswick": 3.75,
    "Nova Scotia": 3.75,
    "Halifax - Nova Scotia": 5.82,
    "Halifax Regional Municipality - Nova Scotia": 5.82
  },
  geographyMaxZoom: {
    "British Columbia": 5.36,
    "Alberta": 5.36,
    "Ontario": 5.36,
    "New Brunswick": 5.36,
    "Nova Scotia": 5.36,
    "Halifax - Nova Scotia": 7.76,
    "Halifax Regional Municipality - Nova Scotia": 7.76
  },
  theme: {
    unlinkedSymbolColor: "#e78f4c",
    linkedSymbolColor: "#19a7d8",
    symbolTextColor: "#ffffff",
    symbolStrokeColor: "#f8f5ee",
    polygonFillColor: "#6fa9ad",
    polygonLineColor: "#3f6f74",
    labelColor: "#172026"
  },
  darkTheme: {
    polygonFillColor: "#d98a45",
    polygonLineColor: "#ffb36c"
  },
  projectTypeColors: {
    "Urban Simulation": "#2563eb",
    "Webmaps, Cartography & Visual Storytelling": "#0f766e",
    "Additional GIS Support Services": "#7c3aed",
    "Additional GIS Services": "#3f7f42",
    "Carbon and Energy Modelling": "#b76e00",
    "Carbon & Energy Modelling": "#b76e00",
    "Site Selection, Logistics & Routing": "#d14a28",
    "Remote Sensing": "#be3455",
    "Uncategorized": "#65727c"
  },
 layers: [
  {
    id: "NationalLevelPoints",
    label: "National points",
    kind: "point",
    scale: "national",
    sourceType: "vector",
    tilesetUrl: "mapbox://lickergeospatial.5iy2egi7wpn8",
    sourceLayer: "823a4508cdc7586f09c8",
    color: "#e78f4c",
    minzoom: 0,
    maxzoom: 3.7,
    defaultVisible: true
  },
  {
    id: "ProvincialLevelPoints",
    label: "Provincial points",
    kind: "point",
    scale: "provincial",
    sourceType: "vector",
    tilesetUrl: "mapbox://lickergeospatial.7l45ks470c2a",
    sourceLayer: "f68f0768d09cd87b59e5",
    color: "#e78f4c",
    minzoom: 3.7,
    maxzoom: 5.4,
    defaultVisible: true
  },
  {
    id: "RegionalLevelPoints",
    label: "Regional points",
    kind: "point",
    scale: "regional",
    sourceType: "vector",
    tilesetUrl: "mapbox://lickergeospatial.qhkc2phuz4v9",
    sourceLayer: "5051ce6d9c09cc253353",
    color: "#e78f4c",
    minzoom: 5.4,
    maxzoom: 7.8,
    defaultVisible: true
  },
  {
    id: "MunicipalLevelPoints",
    label: "Municipal points",
    kind: "point",
    scale: "municipal",
    sourceType: "vector",
    tilesetUrl: "mapbox://lickergeospatial.7qb9kw8w5ah8",
    sourceLayer: "49630a581e13acf9c356",
    color: "#e78f4c",
    minzoom: 7.8,
    maxzoom: 24,
    defaultVisible: true
  },
  {
    id: "ProvincialLevelPolygons",
    label: "Provincial polygons",
    kind: "polygon",
    scale: "provincial",
    sourceType: "vector",
    tilesetUrl: "mapbox://lickergeospatial.6h1pdj8txdci",
    sourceLayer: "8510206a6a5c98b7e457",
    color: "#89b8b7",
    minzoom: 3.7,
    maxzoom: 5.4,
    defaultVisible: true
  },
  {
    id: "RegionalLevelPolygons",
    label: "Regional polygons",
    kind: "polygon",
    scale: "regional",
    sourceType: "vector",
    tilesetUrl: "mapbox://lickergeospatial.vafm6j9xvy1j",
    sourceLayer: "b2f6b023e0f85a1e50db",
    color: "#86b4b3",
    minzoom: 5.4,
    maxzoom: 7.8,
    defaultVisible: true
  },
  {
    id: "MunicipalLevelPolygons",
    label: "Municipal polygons",
    kind: "polygon",
    scale: "municipal",
    sourceType: "vector",
    tilesetUrl: "mapbox://lickergeospatial.v7hvdb6h9yz5",
    sourceLayer: "6fbaa6f70cad63ebb9a9",
    color: "#057184",
    minzoom: 7.8,
    maxzoom: 24,
    defaultVisible: true
  }
],
  office: {
    enabled: true,
    name: "LGeo HQ",
    coordinates: [-123.06922543541361, 49.27105291070608],
    logoUrl: "./assets/LGeo-logo-rgb_vert.jpg",
    minzoom: 10.8,
    iconSize: 0.11,
    iconOpacity: 0.72,
    games: [
      { label: "WhenTaken", url: "https://whentaken.com/" },
      { label: "MapTap", url: "https://maptap.gg/" },
      { label: "Worldle", url: "https://worldle.teuteuf.fr/" },
      { label: "Globle", url: "https://globle-game.com/" },
      { label: "Thursday 30", url: "https://t30.teuteuf.fr/" },
      { label: "Geogrid", url: "https://www.geogridgame.com/" },
      { label: "Travle", url: "https://travle.earth/" }
    ]
  },
  productionTilesets: {
    notes: "Optional production swap: host large polygon layers as Mapbox tilesets and point this config at those IDs."
  }
};
