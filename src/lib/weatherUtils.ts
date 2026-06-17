export function getWeatherDesc(code: number, lang: 'vi' | 'en'): string {
  const translations: Record<number, { vi: string; en: string }> = {
    0: { vi: 'Trời quang đãng', en: 'Clear sky' },
    1: { vi: 'Hầu như không mây', en: 'Mainly clear' },
    2: { vi: 'Ít mây, nắng nhẹ', en: 'Partly cloudy' },
    3: { vi: 'Nhiều mây, âm u', en: 'Overcast' },
    45: { vi: 'Có sương mù', en: 'Fog' },
    48: { vi: 'Sương muối', en: 'Depositing rime fog' },
    51: { vi: 'Mưa phùn nhẹ', en: 'Light drizzle' },
    53: { vi: 'Mưa phùn vừa', en: 'Moderate drizzle' },
    55: { vi: 'Mưa phùn dày đặc', en: 'Dense drizzle' },
    56: { vi: 'Mưa phùn lạnh nhẹ', en: 'Light freezing drizzle' },
    57: { vi: 'Mưa phùn lạnh dày', en: 'Dense freezing drizzle' },
    61: { vi: 'Mưa nhỏ', en: 'Slight rain' },
    63: { vi: 'Mưa rào vừa', en: 'Moderate rain' },
    65: { vi: 'Mưa to kéo dài', en: 'Heavy rain' },
    66: { vi: 'Mưa đông nhẹ', en: 'Light freezing rain' },
    67: { vi: 'Mưa đông mạnh', en: 'Heavy freezing rain' },
    71: { vi: 'Tuyết rơi nhẹ', en: 'Slight snowfall' },
    73: { vi: 'Tuyết rơi vừa', en: 'Moderate snowfall' },
    75: { vi: 'Tuyết rơi nặng', en: 'Heavy snowfall' },
    77: { vi: 'Hạt băng', en: 'Snow grains' },
    80: { vi: 'Mưa rào nhẹ', en: 'Slight rain showers' },
    81: { vi: 'Mưa rào vừa', en: 'Moderate rain showers' },
    82: { vi: 'Mưa rào rất to', en: 'Violent rain showers' },
    85: { vi: 'Tuyết rào nhẹ', en: 'Slight snow showers' },
    86: { vi: 'Tuyết rào nặng', en: 'Heavy snow showers' },
    95: { vi: 'Dông sét nhẹ', en: 'Slight or moderate thunderstorm' },
    96: { vi: 'Dông kèm mưa đá nhẹ', en: 'Thunderstorm with slight hail' },
    99: { vi: 'Dông kèm mưa đá lớn', en: 'Thunderstorm with heavy hail' },
  };

  return translations[code]?.[lang] || (lang === 'vi' ? 'Không rõ' : 'Unknown');
}

export function getWeatherIcon(code: number): string {
  // Return emoji or matching icon style
  if (code === 0) return '☀️';
  if (code >= 1 && code <= 3) return '⛅';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 55) return '🌦️';
  if (code >= 56 && code <= 57) return '🥶';
  if (code >= 61 && code <= 65) return '🌧️';
  if (code >= 66 && code <= 67) return '❄️🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95 && code <= 99) return '⛈️';
  return '❓';
}

export function getUVText(uv: number, lang: 'vi' | 'en'): { text: string; color: string } {
  if (uv < 3) return { text: lang === 'vi' ? 'Thấp' : 'Low', color: 'text-green-500' };
  if (uv < 6) return { text: lang === 'vi' ? 'Trung bình' : 'Moderate', color: 'text-yellow-500 font-medium' };
  if (uv < 8) return { text: lang === 'vi' ? 'Cao' : 'High', color: 'text-orange-500 font-semibold' };
  if (uv < 11) return { text: lang === 'vi' ? 'Rất cao' : 'Very High', color: 'text-red-500 font-bold' };
  return { text: lang === 'vi' ? 'Nguy hại' : 'Extreme', color: 'text-purple-600 font-extrabold animate-pulse' };
}
