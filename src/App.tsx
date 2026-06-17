import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserPreferences, 
  WeatherData, 
  ItineraryPlan, 
  WeatherAlert, 
  Coordinates 
} from './types';
import { translations } from './lib/translations';
import { 
  isFirebaseEnabled, 
  auth, 
  googleProvider, 
  saveUserData, 
  getUserData,
  db,
  saveFavoriteItinerary,
  deleteFavoriteItinerary
} from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

import PreferenceConfig from './components/PreferenceConfig';
import WeatherCard from './components/WeatherCard';
import ItineraryPanel from './components/ItineraryPanel';
import NotificationCenter from './components/NotificationCenter';
import OfflineIndicator from './components/OfflineIndicator';
import SavedItineraries from './components/SavedItineraries';
import RedisDashboard from './components/RedisDashboard';

import { 
  CloudSun, 
  Search, 
  AlertTriangle, 
  Bookmark, 
  Sparkles, 
  LogOut, 
  LogIn, 
  History, 
  Sun, 
  Moon, 
  Globe 
} from 'lucide-react';

const DEFAULT_COORDS: Coordinates = {
  latitude: 21.0285,
  longitude: 105.8542,
  name: "Hanoi",
  country: "Vietnam"
};

export default function App() {
  // Locale State
  const [preferences, setPreferences] = useState<UserPreferences>({
    language: 'vi',
    theme: 'dark',
    preferredActivities: ['outdoor', 'cafe', 'sightseeing'],
    transportMode: 'walking',
    tempTolerance: 'temperate',
    uvTolerance: 'moderate',
    pushAlertsEnabled: true,
    historyNotifications: []
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Coordinates[]>([]);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [activePlan, setActivePlan] = useState<ItineraryPlan | null>(null);
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([]);
  
  // Cloud Database & Cache Synchronization states
  const [favoritesList, setFavoritesList] = useState<any[]>([]);
  const [savingFavorite, setSavingFavorite] = useState<boolean>(false);
  const [redisTrigger, setRedisTrigger] = useState<number>(0);
  
  // App Mechanics
  const [loadingWeather, setLoadingWeather] = useState<boolean>(false);
  const [loadingItinerary, setLoadingItinerary] = useState<boolean>(false);
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);
  const [networkOffline, setNetworkOffline] = useState<boolean>(!navigator.onLine);
  
  // Authentication user
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(isFirebaseEnabled);

  const lang = preferences.language;
  const t = translations[lang];
  const isOffline = simulatedOffline || networkOffline;

  // 1. Connection listener
  useEffect(() => {
    const goOnline = () => setNetworkOffline(false);
    const goOffline = () => setNetworkOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // 2. Firebase Auth Synchronizer
  useEffect(() => {
    if (!isFirebaseEnabled || !auth) {
      // Fallback: Read preferences and logs from localStorage initially
      const localPrefs = localStorage.getItem('weather_ai_prefs');
      if (localPrefs) {
        try {
          setPreferences(JSON.parse(localPrefs));
        } catch {}
      }
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user: any) => {
      setAuthChecking(true);
      if (user) {
        setCurrentUser(user);
        const cloudData = await getUserData(user.uid);
        if (cloudData && cloudData.preferences) {
          setPreferences(cloudData.preferences);
        } else {
          // If no cloud data, save current local preferences as standard profile
          await saveUserData(user.uid, {
            email: user.email,
            displayName: user.displayName,
            preferences,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        setCurrentUser(null);
        // Load clean local details
        const localPrefs = localStorage.getItem('weather_ai_prefs');
        if (localPrefs) {
          try {
            setPreferences(JSON.parse(localPrefs));
          } catch {}
        }
      }
      setAuthChecking(false);
    });

    return () => unsub();
  }, []);

  // Synchronize Cloud Firestore Saved Itineraries for active user account structure
  useEffect(() => {
    if (!isFirebaseEnabled || !db || !currentUser) {
      setFavoritesList([]);
      return;
    }
    const q = query(
      collection(db, "users", currentUser.uid, "favorites"),
      orderBy("savedAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data());
      });
      setFavoritesList(list);
    }, (error) => {
      console.error("App.tsx favorites collection listener failed:", error);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Sync preferences state changes to local storage & cloud profile in real-time
  const updatePreferences = async (newPrefs: Partial<UserPreferences>) => {
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);
    localStorage.setItem('weather_ai_prefs', JSON.stringify(updated));

    if (currentUser && isFirebaseEnabled) {
      await saveUserData(currentUser.uid, {
        preferences: updated,
        updatedAt: new Date().toISOString()
      });
    }
  };

  // Google Login popup
  const handleSignIn = async () => {
    if (!isFirebaseEnabled || !auth || !googleProvider) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      const isUserClosed = err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request';
      if (isUserClosed) {
        console.warn("Google authentication popup was closed/cancelled by the user. Signing in flow aborted.", err);
      } else {
        console.error("Google authentication popup error:", err);
        alert(lang === 'vi' 
          ? 'Đã xảy ra lỗi khi đăng nhập bằng Google. Vui lòng kiểm tra lại cấu hình hoặc nhấn mở tab mới để tránh lỗi Iframe.' 
          : 'Google sign-in error occurred. Please verify your configuration or open the app in a new tab to avoid iframe restrictions.');
      }
    }
  };

  // Logout trigger
  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
  };

  // 3. Load Weather Data from current coordinates
  const fetchWeatherForLocation = async (coords: Coordinates, keepActivePlan: boolean = false) => {
    setLoadingWeather(true);
    setShowSearchResults(false);

    try {
      if (isOffline) {
        // Retrieve values from offline cached local Storage
        const cacheKey = `cached_weather_${coords.name.toLowerCase().replace(/\s/g, '_')}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setWeatherData(parsed);
          
          // Also load matching itinerary if existing in offline logs
          if (!keepActivePlan) {
            const planKey = `cached_plan_${coords.name.toLowerCase().replace(/\s/g, '_')}`;
            const planCached = localStorage.getItem(planKey);
            if (planCached) {
              setActivePlan(JSON.parse(planCached));
            } else {
              setActivePlan(null);
            }
          }
          setLoadingWeather(false);
          return;
        } else {
          throw new Error(lang === 'vi' ? 'Không tìm thấy dữ liệu thời tiết ngoại tuyến cho địa điểm này.' : 'No offline cached meteorological record found for this venue.');
        }
      }

      // Fetch from Node full stack controller endpoints
      const response = await fetch(`/api/weather?lat=${coords.latitude}&lon=${coords.longitude}&name=${encodeURIComponent(coords.name)}`);
      if (!response.ok) throw new Error("Failed to pull metrics from server endpoint");
      
      const meteorologicalDetails: WeatherData = await response.json();
      setWeatherData(meteorologicalDetails);
      setRedisTrigger(prev => prev + 1);

      // Save into cache for offline viewing support
      const cacheKey = `cached_weather_${coords.name.toLowerCase().replace(/\s/g, '_')}`;
      localStorage.setItem(cacheKey, JSON.stringify(meteorologicalDetails));
      localStorage.setItem('last_viewed_coords', JSON.stringify(coords));

      // 4. Generate Personalized Push Warning Alert based on user preferences in real-time
      triggerAlertAnalysis(meteorologicalDetails);

      // Auto-clear current plan if coordinate city shifts
      if (!keepActivePlan) {
        setActivePlan(null);
      }

    } catch (error: any) {
      console.error("Fetch weather fail:", error);
      alert(error.message || "An error occurred fetching meteorological factors.");
    } finally {
      setLoadingWeather(false);
    }
  };

  // Analyze forecast alerts via server route
  const triggerAlertAnalysis = async (currentWeather: WeatherData) => {
    if (isOffline) {
      // Offline fallback: generate simple warnings locally
      const mockAlerts: WeatherAlert[] = [];
      const code = currentWeather.current.weatherCode;
      
      if (code >= 61 && code <= 82) {
        mockAlerts.push({
          id: Math.random().toString(36).substr(2, 9),
          title: lang === 'vi' ? 'Cảnh báo: Mưa lớn' : 'Warning: High Rain Rate',
          message: t.alertPrecipitation,
          severity: 'warning',
          type: 'rain',
          timestamp: new Date().toISOString(),
          read: false
        });
      }

      const uv = currentWeather.daily[0]?.uvIndexMax || 0;
      if (uv >= 6 && preferences.uvTolerance === 'low') {
        mockAlerts.push({
          id: Math.random().toString(36).substr(2, 9),
          title: lang === 'vi' ? 'Cảnh báo tia cực tím (UV)' : 'Skin Protect: Extreme UV',
          message: t.alertUV,
          severity: 'danger',
          type: 'uv',
          timestamp: new Date().toISOString(),
          read: false
        });
      }

      setWeatherAlerts(mockAlerts);
      return;
    }

    try {
      const response = await fetch('/api/analyze-weather-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weatherData: currentWeather, preferences })
      });
      if (response.ok) {
        const data = await response.json();
        setWeatherAlerts(data.alerts || []);
      }
    } catch {
      // Silently catch analytics failures to not interrupt workflow
    }
  };

  // 5. Build AI adaptive travel itinerary plan
  const generateAIItinerary = async () => {
    if (!weatherData) return;
    setLoadingItinerary(true);

    try {
      if (isOffline) {
        throw new Error(lang === 'vi' ? 'Cần có kết nối mạng để khởi tạo kế hoạch thông minh từ Gemini AI.' : 'Internet connection required to compile route itinerary suggestions using Gemini AI.');
      }

      const response = await fetch('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weatherData, preferences })
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || "Failed to sync AI plan from Gemini engine");
      }

      const freshPlan: ItineraryPlan = await response.json();
      setActivePlan(freshPlan);
      setRedisTrigger(prev => prev + 1);

      // Cache itinerary in localStorage for offline viewing support
      const planKey = `cached_plan_${weatherData.coordinates.name.toLowerCase().replace(/\s/g, '_')}`;
      localStorage.setItem(planKey, JSON.stringify(freshPlan));

    } catch (error: any) {
      console.error("AI Planner error:", error);
      alert(error.message || "An error occurred with Gemini travel concierge.");
    } finally {
      setLoadingItinerary(false);
    }
  };

  // Location search bar
  const handleLocationSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || searchQuery.trim().length === 0) return;

    if (isOffline) {
      // Local check if city exists in cache
      const possibleName = searchQuery.trim().toLowerCase().replace(/\s/g, '_');
      const cached = localStorage.getItem(`cached_weather_${possibleName}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        fetchWeatherForLocation(parsed.coordinates);
      } else {
        alert(lang === 'vi' 
          ? 'Bạn đang ngoại tuyến và địa điểm này chưa có dữ liệu lưu sẵn.' 
          : 'You are offline and no saved metrics are available for this city.');
      }
      return;
    }

    try {
      const resp = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}&lang=${lang}`);
      if (!resp.ok) throw new Error("Search geocode failed");
      const data = await resp.json();
      
      if (data.results && data.results.length > 0) {
        // Map geo outcomes
        const mappedList: Coordinates[] = data.results.map((item: any) => ({
          latitude: item.latitude,
          longitude: item.longitude,
          name: item.name,
          country: item.country,
          admin1: item.admin1
        }));
        setSearchResults(mappedList);
        setShowSearchResults(true);
      } else {
        alert(lang === 'vi' ? 'Không tìm thấy địa điểm này. Vui lòng nhập chi tiết hơn.' : 'No locations detected. Please refine query parameters.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Feed trigger on initial component render
  useEffect(() => {
    // Attempt loading last-visited venue coords if stored, otherwise default to Hanoi capital
    const saved = localStorage.getItem('last_viewed_coords');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        fetchWeatherForLocation(parsed);
        return;
      } catch {}
    }
    fetchWeatherForLocation(DEFAULT_COORDS);
  }, []);

  // Real-time automatic weather synchronization (interval syncs every 5 minutes when online)
  useEffect(() => {
    if (isOffline || !weatherData?.coordinates) return;

    const lat = weatherData.coordinates.latitude;
    const lon = weatherData.coordinates.longitude;

    const intervalId = setInterval(() => {
      console.log(`[Real-time Weather] Automatically fetching updated telemetry for ${weatherData.coordinates.name}...`);
      fetchWeatherForLocation(weatherData.coordinates, true);
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [weatherData?.coordinates?.latitude, weatherData?.coordinates?.longitude, isOffline]);

  // Dismiss notification card
  const handleDismissAlert = (id: string) => {
    setWeatherAlerts(prev => prev.filter(a => a.id !== id));
  };

  // Check if plans are currently stored in users favorites subcollection
  const isPlanSaved = activePlan && favoritesList.some(
    item => item.id === activePlan.id
  );

  // Firestore Saved Itineraries synchronizer actions
  const handleSaveFavorite = async () => {
    if (!currentUser) {
      handleSignIn();
      return;
    }
    if (!activePlan) return;
    
    setSavingFavorite(true);
    try {
      if (isPlanSaved) {
        const savedItem = favoritesList.find(
          item => item.id === activePlan.id
        );
        if (savedItem) {
          await deleteFavoriteItinerary(currentUser.uid, savedItem.id);
        }
      } else {
        await saveFavoriteItinerary(currentUser.uid, activePlan);
      }
    } catch (err) {
      console.error("Cloud favorites persist operation failed:", err);
    } finally {
      setSavingFavorite(false);
    }
  };

  // Select favorite itinerary call: loads cached weather or sets searchQuery to trigger geo lookups
  const handleSelectFavoritePlan = async (plan: ItineraryPlan) => {
    setActivePlan(plan);
    setSearchQuery(plan.locationName);

    // Smooth scroll to details card container so mobile & tablet layouts update intuitively without jumping
    setTimeout(() => {
      const panel = document.getElementById('ai-itinerary-panel-container');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);

    const possibleName = plan.locationName.toLowerCase().replace(/\s/g, '_');
    const cachedWeather = localStorage.getItem(`cached_weather_${possibleName}`);
    
    // 1. Instantly restore offline weather representation if present
    if (cachedWeather) {
      try {
        setWeatherData(JSON.parse(cachedWeather));
      } catch {
        setWeatherData(null);
      }
    }

    // 2. Query live weather metrics sequentially to guarantee fresh forecasts on selection
    if (!isOffline) {
      try {
        const resp = await fetch(`/api/geocode?q=${encodeURIComponent(plan.locationName)}&lang=${lang}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.results && data.results.length > 0) {
            const bestMatch = data.results[0];
            const coords: Coordinates = {
              latitude: bestMatch.latitude,
              longitude: bestMatch.longitude,
              name: bestMatch.name,
              country: bestMatch.country,
              admin1: bestMatch.admin1
            };
            await fetchWeatherForLocation(coords, true);
          }
        }
      } catch (err) {
        console.error("Auto load weather for favorite plan error:", err);
      }
    }
  };

  const isDark = preferences.theme === 'dark';

  return (
    <div className={`min-h-screen transition-colors duration-300 font-sans ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`} id="application-root">
      
      {/* Decorative colored glow spheres */}
      <div className="absolute top-0 left-1/4 w-[350px] h-[350px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Main Header / Navigation bar */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-all duration-300 ${
        isDark ? 'border-slate-800/60 bg-slate-950/70 text-slate-100' : 'border-slate-200/80 bg-white/85 text-slate-800 shadow-sm shadow-slate-100/40'
      } py-4 px-6`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          
          {/* Logo brand */}
          <div className="flex items-center space-x-3 select-none" id="branding-title">
            <div className="w-10 h-10 bg-gradient-to-tr from-teal-500 to-sky-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/15">
              <CloudSun className="w-5.5 h-5.5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className={`text-md font-extrabold tracking-tight leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {t.appTitle}
              </h1>
              <p className={`text-[10px] mt-1 font-medium tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t.tagline}
              </p>
            </div>
          </div>

          {/* Search bar + Profile actions */}
          <div className="flex items-center space-x-3 flex-1 sm:max-w-md justify-end">
            <form onSubmit={handleLocationSearch} className="relative flex-1 max-w-sm" id="search-bar-form">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className={`w-full border rounded-xl py-2 pl-3.5 pr-10 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-transparent transition-all ${
                  isDark ? 'bg-slate-900 border-slate-800/80 text-slate-200 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 shadow-sm'
                }`}
              />
              <button
                type="submit"
                className={`absolute right-2 top-1.5 p-1 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                title="Search City Location"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* Dynamic searched results overlay drop */}
              {showSearchResults && searchResults.length > 0 && (
                <div className={`absolute left-0 right-0 mt-2 rounded-xl shadow-2xl p-1 z-50 text-xs space-y-0.5 overflow-hidden border ${
                  isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  {searchResults.map((coords, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => fetchWeatherForLocation(coords)}
                      className={`w-full text-left py-2 px-3 rounded-lg font-medium transition-colors flex items-center justify-between ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{coords.name}, {coords.admin1 || ''}</span>
                      <span className={`text-[10px] shrink-0 font-mono px-2 py-0.5 rounded border ${
                        isDark ? 'text-slate-500 bg-slate-950 border-slate-800/50' : 'text-slate-400 bg-slate-50 border-slate-100'
                      }`}>
                        {coords.country || 'Global'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            {/* Firebase Auth action buttons */}
            <div id="authentication-action-container">
              {authChecking ? (
                <div className="w-8 h-8 rounded-full border-2 border-teal-500/20 border-t-teal-500 animate-spin"></div>
              ) : currentUser ? (
                <div className="flex items-center space-x-2">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'Profile'}
                      className="w-8 h-8 rounded-full border border-teal-500/40 select-none cursor-pointer"
                      title={currentUser.displayName || 'Google Profile'}
                    />
                  ) : (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs select-none cursor-pointer border ${
                      isDark ? 'bg-slate-800 border-slate-700/60 text-teal-400' : 'bg-white border-slate-200 text-teal-600 shadow-sm'
                    }`}>
                      {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
                    </div>
                  )}
                  <button
                    onClick={handleSignOut}
                    className={`p-2 border rounded-xl transition-colors ${
                      isDark ? 'bg-slate-900 hover:bg-red-500/10 hover:text-red-400 border-slate-800 text-slate-400' : 'bg-white hover:bg-red-50 hover:text-red-500 border-slate-200 text-slate-500 shadow-sm'
                    }`}
                    title={t.signout}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                isFirebaseEnabled && (
                  <button
                    onClick={handleSignIn}
                    className={`p-2.5 border rounded-xl flex items-center space-x-1.5 transition-colors ${
                      isDark ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 shadow-sm'
                    }`}
                    title={t.signinGoogle}
                  >
                    <LogIn className="w-3.5 h-3.5 text-teal-500" />
                    <span className={`text-[10px] font-bold hidden sm:inline ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{t.signinGoogle}</span>
                  </button>
                )
              )}
            </div>
          </div>

        </div>
      </header>

      {/* Primary Dashboard layout stage */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        
        {/* Connection health banner & Offline status indicator */}
        <OfflineIndicator
          isOffline={isOffline}
          onToggleSimulatedOffline={() => {
            setSimulatedOffline(!simulatedOffline);
            // Re-trigger weather details on switch
            if (weatherData) fetchWeatherForLocation(weatherData.coordinates);
          }}
          lang={lang}
          theme={preferences.theme}
        />

        {/* Outer Bento grid of operations */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-bento-grid">
          
          {/* Left Side: Preferences settings & Warnings (cols: 4) */}
          <section className="lg:col-span-4 space-y-6 flex flex-col justify-start">
            
            <PreferenceConfig
              preferences={preferences}
              onUpdatePreferences={updatePreferences}
              lang={lang}
            />

            <NotificationCenter
              alerts={weatherAlerts}
              onDismissAlert={handleDismissAlert}
              lang={lang}
              pushAlertsEnabled={preferences.pushAlertsEnabled}
              theme={preferences.theme}
            />

            <SavedItineraries
              currentUser={currentUser}
              onSelectPlan={handleSelectFavoritePlan}
              lang={lang}
              activePlanId={activePlan?.id}
              theme={preferences.theme}
            />

            {currentUser && currentUser.email === 'manhnguyen0865280164@gmail.com' && (
              <RedisDashboard
                lang={lang}
                refreshTrigger={redisTrigger}
                theme={preferences.theme}
              />
            )}

          </section>

          {/* Right Side: Primary Meteorological cards & AI Plan (cols: 8) */}
          <section className="lg:col-span-8 space-y-6">
            
            {loadingWeather ? (
              <div className={`transition-all duration-300 border rounded-2xl p-16 flex flex-col items-center justify-center space-y-4 ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow shadow-slate-100/50'
              }`} id="weather-details-loading-spinner">
                <div className="w-10 h-10 rounded-full border-2 border-teal-500/20 border-t-teal-500 animate-spin"></div>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {lang === 'vi' ? 'Đang cập nhật số liệu khí tượng trực tiếp...' : 'Connecting with meteorology servers...'}
                </p>
              </div>
            ) : weatherData ? (
              <WeatherCard
                weather={weatherData}
                lang={lang}
                onRefresh={() => fetchWeatherForLocation(weatherData.coordinates)}
                loading={loadingWeather}
                theme={preferences.theme}
              />
            ) : null}

            <ItineraryPanel
              plan={activePlan}
              onGenerate={generateAIItinerary}
              loading={loadingItinerary}
              lang={lang}
              currentUser={currentUser}
              isSaved={isPlanSaved}
              onSave={handleSaveFavorite}
              saving={savingFavorite}
              theme={preferences.theme}
            />

          </section>

        </div>

      </main>

      {/* Styled Footer */}
      <footer className={`border-t py-8 text-center text-xs font-medium transition-colors duration-300 ${
        isDark ? 'border-slate-900 bg-slate-950 text-slate-600' : 'border-slate-200 bg-white text-slate-400 shadow-inner'
      }`}>
        <p className="max-w-lg mx-auto leading-relaxed px-4">
          {lang === 'vi' 
            ? 'Weather AI Concierge • Công nghệ phân tích dự báo kết hợp Google Gemini. Maps tìm kiếm địa chỉ thực tế.' 
            : 'Weather AI Concierge • Forecast parsing combined with Google Gemini models. Maps query local real venues.'}
        </p>
      </footer>

    </div>
  );
}
