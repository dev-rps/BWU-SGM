export const getOpenWeatherKey = () => {
  const envVal = import.meta.env.VITE_OPENWEATHER_API_KEY
  if (!envVal) console.error('[Safety Guardian] VITE_OPENWEATHER_API_KEY is not configured.')
  return envVal
}

export const getTomTomKey = () => {
  const envVal = import.meta.env.VITE_TOMTOM_API_KEY
  if (!envVal || envVal === 'your_tomtom_api_key_here') {
    console.error('[Safety Guardian] VITE_TOMTOM_API_KEY is not set')
    throw new Error('VITE_TOMTOM_API_KEY is not set')
  }
  return envVal
}

export const getGeminiKey = () => {
  const envVal = import.meta.env.VITE_GEMINI_API_KEY
  if (!envVal) console.error('[Safety Guardian] VITE_GEMINI_API_KEY is not configured.')
  return envVal
}
