        const API_KEY = '9e025df43702668b06d1360679c9c51b';
        const API_BASE = 'https://api.openweathermap.org/data/2.5';
        const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

        let tempChart = null;
        let humidityChart = null;

        document.addEventListener('DOMContentLoaded', () => {
            loadTheme();
            document.getElementById('cityInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchByCity();
            });
        });

        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            if (tempChart) updateCharts();
        }

        function loadTheme() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
        }

        async function searchByCity() {
            const city = document.getElementById('cityInput').value.trim();
            if (!city) {
                showError('Por favor, digite o nome de uma cidade.');
                return;
            }
            try {
                showLoading(true);
                hideError();
                const geo = await geocodeCity(city);
                if (!geo) {
                    throw new Error('Cidade não encontrada pelo serviço de geocodificação.');
                }
                document.getElementById('cityInput').value = `${geo.name}${geo.state ? ', ' + geo.state : ''}, ${geo.country}`;
                await fetchWeatherDataByCoords(geo.lat, geo.lon);
            } catch (err) {
                showLoading(false);
                showError(err.message || 'Erro ao buscar a cidade.');
                console.error(err);
            }
        }

        async function geocodeCity(city) {
            const url = `${GEO_BASE}/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                let msg = 'Erro ao consultar geocodificação';
                try { const j = await resp.json(); if (j.message) msg += ': ' + j.message; } catch (e) {}
                throw new Error(msg);
            }
            const data = await resp.json();
            return data && data.length ? data[0] : null;
        }

        async function reverseGeocodeOWM(lat, lon) {
            try {
                const url = `${GEO_BASE}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
                const resp = await fetch(url);
                if (!resp.ok) return null;
                const data = await resp.json();
                if (!data || !data.length) return null;
                const item = data[0];
                return {
                    name: item.name,
                    state: item.state,
                    country: item.country
                };
            } catch (e) {
                console.warn('OWM reverse geocode error', e);
                return null;
            }
        }

        async function reverseGeocodeNominatim(lat, lon) {
            try {
                const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=pt-BR`;
                const resp = await fetch(url);
                if (!resp.ok) return null;
                const data = await resp.json();
                if (!data || !data.address) return null;
                const a = data.address;
                return {
                    neighbourhood: a.neighbourhood || a.suburb || a.hamlet || a.village || null,
                    city: a.city || a.town || a.village || a.county || null,
                    state: a.state || null,
                    country: a.country || null
                };
            } catch (e) {
                console.warn('Nominatim reverse geocode error', e);
                return null;
            }
        }

        function getLocationWeather() {
            if (!navigator.geolocation) {
                showError('Geolocalização não é suportada pelo seu navegador.');
                return;
            }

            showLoading(true);
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude, accuracy } = position.coords;
                    console.log(`Coordenadas: ${latitude}, ${longitude} (accuracy ${accuracy}m)`);
                    await fetchWeatherDataByCoords(latitude, longitude);
                },
                (error) => {
                    showLoading(false);
                    let msg = 'Não foi possível obter sua localização.';
                    if (error && error.code === 1) msg = 'Permissão negada para acessar a localização.';
                    if (error && error.code === 2) msg = 'Localização indisponível.';
                    if (error && error.code === 3) msg = 'Timeout ao obter a localização.';
                    showError(msg);
                    console.error(error);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        }

        async function fetchWeatherDataByCoords(lat, lon) {
            try {
                showLoading(true);
                hideError();

                const currentUrl = `${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=pt_br`;
                const forecastUrl = `${API_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=pt_br`;

                const [currentResponse, forecastResponse] = await Promise.all([
                    fetch(currentUrl),
                    fetch(forecastUrl)
                ]);

                if (!currentResponse.ok) {
                    let msg = 'Erro ao buscar dados atuais.';
                    try { const j = await currentResponse.json(); if (j.message) msg += ' ' + j.message; } catch(e){}
                    throw new Error(msg);
                }
                if (!forecastResponse.ok) {
                    let msg = 'Erro ao buscar previsão.';
                    try { const j = await forecastResponse.json(); if (j.message) msg += ' ' + j.message; } catch(e){}
                    throw new Error(msg);
                }

                const currentData = await currentResponse.json();
                const forecastData = await forecastResponse.json();

                let locationInfo = null;
                try {
                    locationInfo = await reverseGeocodeOWM(lat, lon);
                    if (!locationInfo || (!locationInfo.city && !locationInfo.state && !locationInfo.neighbourhood)) {
                        const nom = await reverseGeocodeNominatim(lat, lon);
                        if (nom) locationInfo = { ...locationInfo, ...nom };
                    }
                } catch (e) {
                    console.warn('Reverse geocoding falhou:', e);
                }

                displayCurrentWeather(currentData, locationInfo);
                displayForecast(forecastData);
                displayCharts(forecastData);

                showLoading(false);
            } catch (error) {
                showLoading(false);
                showError(error.message || 'Erro ao buscar dados do tempo. Verifique sua API Key.');
                console.error(error);
            }
        }

        async function fetchWeatherData(city) {
            try {
                showLoading(true);
                hideError();
                const geo = await geocodeCity(city);
                if (!geo) throw new Error('Cidade não encontrada.');
                await fetchWeatherDataByCoords(geo.lat, geo.lon);
            } catch (err) {
                showLoading(false);
                showError(err.message || 'Cidade não encontrada ou erro na API.');
                console.error(err);
            }
        }

        function displayCurrentWeather(data, locationInfo) {
            const container = document.getElementById('currentWeather');
            const temp = Math.round(data.main.temp);
            const feelsLike = Math.round(data.main.feels_like);
            const icon = getWeatherIcon(data.weather[0].main);
            // extrair bairro, cidade e estado a partir de locationInfo (quando disponível)
            const neighbourhood = locationInfo && (locationInfo.neighbourhood || locationInfo.suburb || locationInfo.neighbourhood) || null;
            const cityFromLoc = locationInfo && (locationInfo.name || locationInfo.city || locationInfo.town || locationInfo.village) || data.name;
            const stateFromLoc = locationInfo && (locationInfo.state) || null;
            const countryFromLoc = locationInfo && (locationInfo.country) || data.sys.country;

            container.innerHTML = `
                <h2>${cityFromLoc}${stateFromLoc ? ', ' + stateFromLoc : ''}${countryFromLoc ? ' - ' + countryFromLoc : ''}</h2>
                ${neighbourhood ? `<p class="location-details">Bairro: ${neighbourhood}</p>` : ''}
                <div class="weather-icon">${icon}</div>
                <div class="temperature">${temp}°C</div>
                <p style="font-size: 1.3em; color: var(--text-secondary); margin: 10px 0;">
                    ${data.weather[0].description}
                </p>
                <div class="weather-details">
                    <div class="detail-item">
                        <div class="detail-label">Sensação Térmica</div>
                        <div class="detail-value">${feelsLike}°C</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Umidade</div>
                        <div class="detail-value">${data.main.humidity}%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Vento</div>
                        <div class="detail-value">${data.wind.speed} m/s</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Pressão</div>
                        <div class="detail-value">${data.main.pressure} hPa</div>
                    </div>
                </div>
            `;
            container.classList.remove('hidden');
        }

        function displayForecast(data) {
            const container = document.getElementById('forecastGrid');
            const dailyData = processForecastData(data.list);

            container.innerHTML = dailyData.map(day => `
                <div class="forecast-card">
                    <div class="forecast-date">${day.date}</div>
                    <div class="forecast-icon">${getWeatherIcon(day.weather)}</div>
                    <div class="forecast-temp">${day.temp}°C</div>
                    <p style="color: var(--text-secondary); margin-top: 10px;">
                        ${day.description}
                    </p>
                    <p style="color: var(--text-secondary); font-size: 0.9em; margin-top: 5px;">
                        💧 ${day.humidity}%
                    </p>
                </div>
            `).join('');

            document.getElementById('forecastContainer').classList.remove('hidden');
        }

        function processForecastData(list) {
            const daily = {};
            
            list.forEach(item => {
                const date = new Date(item.dt * 1000);
                const day = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
                
                if (!daily[day]) {
                    daily[day] = {
                        date: day,
                        temp: Math.round(item.main.temp),
                        weather: item.weather[0].main,
                        description: item.weather[0].description,
                        humidity: item.main.humidity
                    };
                }
            });

            return Object.values(daily).slice(0, 5);
        }

        function displayCharts(data) {
            const chartData = prepareChartData(data.list);
            
            destroyCharts();

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const textColor = isDark ? '#eaeaea' : '#2c3e50';
            const gridColor = isDark ? '#2d3748' : '#e1e8ed';

            const tempCtx = document.getElementById('tempChart').getContext('2d');
            tempChart = new Chart(tempCtx, {
                type: 'line',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Temperatura (°C)',
                        data: chartData.temps,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            labels: { color: textColor }
                        }
                    },
                    scales: {
                        y: {
                            ticks: { color: textColor },
                            grid: { color: gridColor }
                        },
                        x: {
                            ticks: { color: textColor },
                            grid: { color: gridColor }
                        }
                    }
                }
            });

            const humidityCtx = document.getElementById('humidityChart').getContext('2d');
            humidityChart = new Chart(humidityCtx, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Umidade (%)',
                        data: chartData.humidity,
                        backgroundColor: 'rgba(46, 204, 113, 0.6)',
                        borderColor: '#2ecc71',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            labels: { color: textColor }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: { color: textColor },
                            grid: { color: gridColor }
                        },
                        x: {
                            ticks: { color: textColor },
                            grid: { color: gridColor }
                        }
                    }
                }
            });

            document.getElementById('chartsContainer').classList.remove('hidden');
        }

        function prepareChartData(list) {
            const labels = [];
            const temps = [];
            const humidity = [];

            list.slice(0, 16).forEach((item, index) => {
                if (index % 4 === 0) {
                    const date = new Date(item.dt * 1000);
                    labels.push(date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
                    temps.push(Math.round(item.main.temp));
                    humidity.push(item.main.humidity);
                }
            });

            return { labels, temps, humidity };
        }

        function updateCharts() {
            if (tempChart && humidityChart) {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const textColor = isDark ? '#eaeaea' : '#2c3e50';
                const gridColor = isDark ? '#2d3748' : '#e1e8ed';

                [tempChart, humidityChart].forEach(chart => {
                    chart.options.plugins.legend.labels.color = textColor;
                    chart.options.scales.y.ticks.color = textColor;
                    chart.options.scales.y.grid.color = gridColor;
                    chart.options.scales.x.ticks.color = textColor;
                    chart.options.scales.x.grid.color = gridColor;
                    chart.update();
                });
            }
        }

        function destroyCharts() {
            if (tempChart) {
                tempChart.destroy();
                tempChart = null;
            }
            if (humidityChart) {
                humidityChart.destroy();
                humidityChart = null;
            }
        }

        function getWeatherIcon(weather) {
            const icons = {
                'Clear': '☀️',
                'Clouds': '☁️',
                'Rain': '🌧️',
                'Drizzle': '🌦️',
                'Thunderstorm': '⛈️',
                'Snow': '❄️',
                'Mist': '🌫️',
                'Fog': '🌫️',
                'Haze': '🌫️'
            };
            return icons[weather] || '🌤️';
        }

        function showLoading(show) {
            document.getElementById('loading').classList.toggle('hidden', !show);
        }

        function showError(message) {
            const errorEl = document.getElementById('errorMessage');
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }

        function hideError() {
            document.getElementById('errorMessage').classList.add('hidden');
        }
