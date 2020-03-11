import { LightningElement,api,track } from 'lwc';


export default class OrderItemTile extends LightningElement {
    @api rest;
    zoomLevel = 10;
 
  connectedCallback(){
      
    let location1 = {...this.rest.restaurant.location, "City":this.rest.restaurant.location.city,"Street":this.rest.restaurant.location.address}
    let mapMarker1 = [{"location":location1}]
let y1={...this.rest.restaurant, "mapMarker":mapMarker1, "title":this.rest.restaurant.location.address}
this.rest={...this.rest,"restaurant":y1}
  console.log(JSON.stringify(this.rest));  
    
  }
  //  testlongitude=this.rest.restaurant.location.Longitude
 //   testlatitude=this.rest.restaurant.location.Latitude
    handleWebsite(event){
        this.resturantWebsite = event.target.name;
        window.open(this.resturantWebsite,'_blank');
    }

    handleMenu(event){
        this.resturantMenu = event.target.name;
        window.open(this.resturantMenu,'_blank');
    } 

}




