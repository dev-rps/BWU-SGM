import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BASE_URL = 'https://bwu-sgm.vercel.app';
const DEFAULT_TITLE = 'Safety Guardian — Real-time Safe Navigation & Emergency Assistance';
const DEFAULT_DESC = 'Navigate West Bengal safely with real-time safety scores, AI route analysis, community hazard reports, and instant emergency SOS assistance.';

const ROUTE_SEO_MAP = {
  '/': {
    title: 'Safety Guardian — Real-time Safe Navigation & Emergency Assistance',
    description: 'Explore live safety scores, secure travel routes, and instant emergency assistance across Kolkata and West Bengal.',
  },
  '/search': {
    title: 'Search Safe Destinations | Safety Guardian',
    description: 'Find destinations with live safety ratings, crime risk analysis, and safe corridor recommendations.',
  },
  '/routes': {
    title: 'Safe Route Selection & Analysis | Safety Guardian',
    description: 'Compare multiple driving, walking, and transit routes evaluated for street lighting, crowd density, and safety scores.',
  },
  '/navigate': {
    title: 'Live Safe Navigation | Safety Guardian',
    description: 'Turn-by-turn navigation with real-time hazard proximity warnings and SOS quick-dispatch.',
  },
  '/safety': {
    title: 'Safety Heatmaps & Crime Insights | Safety Guardian',
    description: 'Inspect live crime heatmaps, safe zones, police station radiuses, and community reports in West Bengal.',
  },
  '/reports': {
    title: 'Community Hazard Reports & Incident Alerts | Safety Guardian',
    description: 'View and submit live community hazard reports, road obstructions, lighting issues, and safety hazards.',
  },
  '/weather': {
    title: 'Live Weather & Flood Alert Monitoring | Safety Guardian',
    description: 'Check real-time weather, precipitation forecasts, waterlogging reports, and flood risk zones in West Bengal.',
  },
  '/emergency': {
    title: 'Emergency SOS & Instant Safety Dispatch | Safety Guardian',
    description: 'Trigger emergency SOS alerts, broadcast live GPS coordinates, and contact emergency services instantly.',
  },
  '/chat': {
    title: 'AI Safety Assistant & Support | Safety Guardian',
    description: 'Chat with our AI safety companion for emergency advice, safe travel guidance, and local safety tips.',
  },
  '/profile': {
    title: 'My Profile & Emergency Contacts | Safety Guardian',
    description: 'Manage your emergency contacts, medical profile, and personal safety preferences.',
  },
  '/achievements': {
    title: 'Safety Badges & Achievements | Safety Guardian',
    description: 'Earn safety badges for verified community reporting, safe journeys, and emergency preparedness.',
  },
  '/privacy': {
    title: 'Privacy Policy | Safety Guardian',
    description: 'Read the Privacy Policy for Safety Guardian to understand how we protect and safeguard your personal and location data.',
  },
  '/terms': {
    title: 'Terms of Service | Safety Guardian',
    description: 'Review the Terms of Service governing the use of the Safety Guardian platform and emergency services.',
  },
  '/login': {
    title: 'Sign In | Safety Guardian',
    description: 'Sign in to access personalized safety navigation, emergency contact sync, and community reporting.',
  },
  '/signup': {
    title: 'Create an Account | Safety Guardian',
    description: 'Join Safety Guardian to travel safely across West Bengal with AI route monitoring and instant SOS support.',
  },
  '/onboarding': {
    title: 'Welcome to Safety Guardian',
    description: 'Set up your safety profile, configure emergency contacts, and learn how to use Safety Guardian.',
  },
};

function updateMetaTag(attribute, key, content) {
  let element = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function updateCanonical(url) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

export function useSEO() {
  const location = useLocation();

  useEffect(() => {
    const config = ROUTE_SEO_MAP[location.pathname] || {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESC,
    };

    // 1. Update Title
    document.title = config.title;

    // 2. Primary Meta Description
    updateMetaTag('name', 'description', config.description);

    // 3. Open Graph Tags
    const fullUrl = `${BASE_URL}${location.pathname === '/' ? '/' : location.pathname}`;
    updateMetaTag('property', 'og:title', config.title);
    updateMetaTag('property', 'og:description', config.description);
    updateMetaTag('property', 'og:url', fullUrl);

    // 4. Twitter Tags
    updateMetaTag('name', 'twitter:title', config.title);
    updateMetaTag('name', 'twitter:description', config.description);

    // 5. Canonical Link
    updateCanonical(fullUrl);
  }, [location.pathname]);
}

export default function RouteSEOTracker() {
  useSEO();
  return null;
}
