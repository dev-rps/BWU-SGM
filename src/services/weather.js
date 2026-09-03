import { getOpenWeatherKey } from './apiKeys';
const API_KEY = getOpenWeatherKey();

export async function getWeather(lat, lng) {
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch weather");
  }

  const current = await response.json();

  return {
    current,
  };
}