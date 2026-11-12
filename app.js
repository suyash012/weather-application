// Weather lookups go through the same-origin proxy in server.js, which holds the
// OpenWeatherMap API key in the OPENWEATHER_API_KEY environment variable.
// No API key is ever shipped to or sent from the browser.
const apiurl = "/api/weather?city=";
const searchbox=document.querySelector(".sea input")
const weatherbutton=document.querySelector(".sea button")
const weathericon=document.querySelector(".weather-icon")

async function checkweather(city){
    const response= await fetch(apiurl + encodeURIComponent(city));
    var data =  await response.json();
    

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
    checkweather(searchbox.value)
})



