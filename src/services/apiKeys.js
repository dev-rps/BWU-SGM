export const getOpenWeatherKey = () => {
  const envVal = import.meta.env.VITE_OPENWEATHER_API_KEY
  if (!envVal || envVal === 'your_openweather_api_key_here') {
    console.warn('[Safety Guardian] VITE_OPENWEATHER_API_KEY is not configured.')
    return ''
  }
  return envVal
}

export const getTomTomKey = () => {
  const envVal = import.meta.env.VITE_TOMTOM_API_KEY
  if (!envVal || envVal === 'your_tomtom_api_key_here') {
    console.warn('[Safety Guardian] VITE_TOMTOM_API_KEY is not configured.')
    return ''
  }
  return envVal
}

export const getGeminiKey = () => {
  const envVal = import.meta.env.VITE_GEMINI_API_KEY
  if (!envVal || envVal === 'your_gemini_api_key_here') {
    console.warn('[Safety Guardian] VITE_GEMINI_API_KEY is not configured.')
    return ''
  }
  return envVal
}
