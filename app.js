// Same-origin proxy (see server.js); the OpenWeatherMap key never reaches the browser.
const apiurl = "/api/weather?q=";
const searchbox=document.querySelector(".sea input")
const weatherbutton=document.querySelector(".sea button")
const weathericon=document.querySelector(".weather-icon")

function showerror(message){
    const errorbox = document.querySelector(".error");
    errorbox.textContent = message;
    errorbox.style.display = "block";
    document.querySelector(".hide").style.display = "none";
}

async function checkweather(city){
    document.querySelector(".error").style.display = "none";

    let data;
    try {
        const response = await fetch(apiurl+encodeURIComponent(city));
        // The proxy forwards the provider's status and JSON body ({cod, message} on errors).
        data = await response.json().catch(() => null);
        if (!response.ok) {
            const message = data && typeof data.message === "string"
                ? data.message
                : "Weather lookup failed (" + response.status + ")";
            showerror(message);
            return;
        }
    } catch (e) {
        showerror("Unable to reach the weather service. Please try again.");
        return;
    }

    if (!data || typeof data !== "object" ||
        !data.main || typeof data.main.temp !== "number" ||
        !data.wind ||
        !Array.isArray(data.weather) || !data.weather[0]) {
        showerror("Unexpected response from the weather service.");
        return;
    }

    document.querySelector(".city").textContent = data.name;
    document.querySelector(".temp").textContent = Math.round(data.main.temp) + "°c";
    document.querySelector(".text").textContent = data.main.humidity + "%";
    document.querySelector(".text2").textContent = data.wind.speed + "km/hr";


if(data.weather[0].main=="Mist"){
  weathericon.src= "image/mist.png"
}
else if (data.weather[0].main=="Clear"){
    weathericon.src="image/clear.png"
}
else if (data.weather[0].main=="Clouds"){
 weathericon.src="image/weather.png"
}
else if (data.weather[0].main=="Drizzle"){
    weathericon.src="image/drizzle.png"
   }

   else if (data.weather[0].main=="Rain"){
    weathericon.src="image/rain.png"
   } 
   else if (data.weather[0].main=="Haze"){
    weathericon.src="image/haze.png"
   }
   else if (data.weather[0].main=="Smoke"){
    weathericon.src="image/Smoke.png"
   }

   document.querySelector(".hide").style.display="block"
   document.querySelector(".container").style.backdropFilter="blur(5px)"
}
weatherbutton.addEventListener("click", ()=>{
    checkweather(searchbox.value).catch(()=>{
        showerror("Something went wrong. Please try again.")
    })
})



