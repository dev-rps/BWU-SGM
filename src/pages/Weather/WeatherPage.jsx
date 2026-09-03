import { useEffect, useState } from "react";
import { useAppStore } from "../../context/store";
import { getWeather } from "../../services/weather";

export default function WeatherPage() {
  const { userLocation } = useAppStore();

  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadWeather() {
      try {
        const data = await getWeather(
          userLocation.lat,
          userLocation.lng
        );
        setWeather(data);
      } catch (err) {
        console.error(err);
        setError("Unable to load weather");
      } finally {
        setLoading(false);
      }
    }

    if (userLocation?.lat && userLocation?.lng) {
      loadWeather();
    }
  }, [userLocation]);

  if (loading) return <div className="p-4">Loading weather...</div>;

  if (error) return <div className="p-4">{error}</div>;

  return (
    <div className="p-5">
      <h1 className="text-2xl font-bold mb-4">
        Weather
      </h1>

      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-xl font-semibold">
          {weather.current.name}
        </h2>

        <p>
          🌡 Temperature: {weather.current.main.temp}°C
        </p>

        <p>
          🤒 Feels Like: {weather.current.main.feels_like}°C
        </p>

        <p>
          🌥 Condition: {weather.current.weather[0].description}
        </p>

        <p>
          💧 Humidity: {weather.current.main.humidity}%
        </p>

        <p>
          💨 Wind: {weather.current.wind.speed} m/s
        </p>
      </div>
    </div>
  );
}