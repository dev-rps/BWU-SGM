import { getOpenWeatherKey } from './apiKeys';

export async function getWeather(lat, lng) {
  const apiKey = getOpenWeatherKey();
  if (!apiKey) {
    throw new Error("OpenWeather API key is not configured.");
  }
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch weather");
  }

  const current = await response.json();

  return {
    current,
  };
}