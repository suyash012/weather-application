const apiurl = "https://api.openweathermap.org/data/2.5/weather?units=metric&q=";
const apikey="74dda9ad8a132d1dafbaa57f9b359f33";
const searchbox=document.querySelector(".sea input")
const weatherbutton=document.querySelector(".sea button")
const weathericon=document.querySelector(".weather-icon")

async function checkweather(city){
    const response= await fetch(apiurl+city+`&appid=${apikey}`);
    var data =  await response.json();
    

    document.querySelector(".city").innerHTML=data.name ;
    document.querySelector(".temp").innerHTML=Math.round(data.main.temp)+"°c";
    document.querySelector(".text").innerHTML=data.main.humidity+"%";
    document.querySelector(".text2").innerHTML=data.wind.speed+"km/hr";


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



