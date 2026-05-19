import { fetchWeatherApi } from 'openmeteo';

export const obterDadosCafe = async (lat, lon, dataInicio) => {
    const url = "https://api.open-meteo.com/v1/forecast";

    const hoje = new Date().toISOString().split('T')[0]; // Data atual no formato YYYY-MM-DD
    const params = {
        latitude: lat,
        longitude: lon,
        start_date: dataInicio || hoje, // Se dataInicio não for fornecida, usa a data atual
        end_date: hoje,
        // Dados para o cafeicultor
        hourly: [
            "relative_humidity_2m", 
            "precipitation", 
            "soil_moisture_7_to_28cm"
        ],
        daily: [
            "precipitation_sum", 
            "et0_fao_evapotranspiration", 
            "temperature_2m_max", 
            "temperature_2m_min"
        ],
        timezone: "auto"
    };

    const responses = await fetchWeatherApi(url, params);
    const response = responses[0];
    const utcOffsetSeconds = response.utcOffsetSeconds();
    const hourly = response.hourly();
    const daily = response.daily();

    // Helper para o tempo
    const range = (start, stop, step) =>
        Array.from({ length: (stop - start) / step }, (_, i) => start + i * step);

    // retorno dos dados
    return {
        horario: {
            timestamps: range(Number(hourly.time()), Number(hourly.timeEnd()), hourly.interval())
                .map(t => new Date((t + utcOffsetSeconds) * 1000)),
            umidadeRelativa: hourly.variables(0).valuesArray(),
            chuva: hourly.variables(1).valuesArray(),
            umidadeSolo: hourly.variables(2).valuesArray()
        },
        diario: {
            datas: range(Number(daily.time()), Number(daily.timeEnd()), daily.interval())
                .map(t => new Date((t + utcOffsetSeconds) * 1000)),
            somaChuva: daily.variables(0).valuesArray(),
            evapotranspiracao: daily.variables(1).valuesArray(),
            tempMax: daily.variables(2).valuesArray(),
            tempMin: daily.variables(3).valuesArray()
        }
    };
};