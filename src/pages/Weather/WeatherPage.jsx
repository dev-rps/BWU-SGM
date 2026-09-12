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

        <p className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-amber-500">device_thermostat</span>
          <span>Temperature: {weather.current.main.temp}°C</span>
        </p>

        <p className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-orange-500">thermostat</span>
          <span>Feels Like: {weather.current.main.feels_like}°C</span>
        </p>

        <p className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-sky-500">cloud</span>
          <span>Condition: {weather.current.weather[0].description}</span>
        </p>

        <p className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-blue-500">humidity_mid</span>
          <span>Humidity: {weather.current.main.humidity}%</span>
        </p>

        <p className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-teal-500">air</span>
          <span>Wind: {weather.current.wind.speed} m/s</span>
        </p>
      </div>
    </div>
  );
}