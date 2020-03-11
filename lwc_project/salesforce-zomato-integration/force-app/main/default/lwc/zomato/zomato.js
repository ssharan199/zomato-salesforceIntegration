/* eslint-disable no-console */
/* eslint-disable no-alert */
import { LightningElement,track,wire } from 'lwc';
import getLocation from '@salesforce/apex/zomatoClass.getLocation';
import getCategory from '@salesforce/apex/zomatoClass.getCategory';
import searchRestaurants from '@salesforce/apex/zomatoClass.searchRestaurants';
import { CurrentPageReference } from 'lightning/navigation';
import { fireEvent } from 'c/pubsub';


import food from '@salesforce/resourceUrl/food';
import foodslide2 from  '@salesforce/resourceUrl/foodslide2';
import foodslide3 from  '@salesforce/resourceUrl/foodslide3';
import foodslide4 from  '@salesforce/resourceUrl/foodslide4';


export default class Zomato extends LightningElement {
     // Expose the static resource URL for use in the template
     foodLogoUrl = food;
     foodonslide2 = foodslide2;
     foodonslide3 =  foodslide3;
     foodonslide4 = foodslide4;

     @track category;
     @track inputCity;
     entityId = '';
    @track selectedLocation = '';
    entityType = '';
    restaurant = '';
   
//Get a reference to the current page in Salesforce
@wire(CurrentPageReference) pageRef;

    get options() {
        return [
            { label: 'Delivery', value: 'Delivery' },
            { label: 'Dine-out', value: 'Dine-out' },
            { label: 'Nightlife', value: 'Nightlife' },
            { label: 'Catching-up', value: 'Catching-up' },
            { label: 'Takeaway', value: 'Takeaway' },
            { label: 'Cafes', value: 'Cafes' },
            { label: 'Daily Menus', value: 'Daily Menus' },
            { label: 'Breakfast', value: 'Breakfast' },
            { label: 'Lunch', value: 'Lunch' },
            { label: 'Dinner', value: 'Dinner'  },
            { label: 'Pubs & Bars', value: 'Pubs & Bars' },
            { label: 'Pocket Friendly Delivery', value: 'Pocket Friendly Delivery' },
            { label: 'Clubs & Lounges', value: 'Clubs & Lounges' },
        ];
    }
    handleChange(event) {
        if(event.target.name==='category'){
        this.category = event.detail.value;
       // window.alert('value: ' + this.category);
        }
        else if(event.target.name==='city')
        {
            this.inputCity = event.detail.value;
            //window.alert('value: ' + this.inputCity);  
        }
    }
    handleClick() {
        getLocation({ 'locationName' : this.inputCity })
        .then(result => {
            //json.parse- convert from string format to wrapper format-key value pair
            const output = JSON.parse(result);
            this.error = undefined
            console.log("Location::::", output);

            if(output !== undefined) {
                this.entityId = output[0].entity_id;
                this.entityType = output[0].entity_type;
                this.selectedLocation = output[0].title;
                console.log('this.selectedLocation',this.selectedLocation+this.entityId+this.entityType);
                searchRestaurant();
                alert('Called');
            }
            else {
                console.log("No info returned in call back in selectLocation method");
            }
        })
        .catch(error => {
            this.message = undefined;
            this.error = error;
            console.log("error", JSON.stringify(this.error));
        });

        getCategory({ 'category' : this.category })
        .then(result => {
            const output = JSON.parse(result);
            this.error = undefined
            console.log("Category::::", output);

            if(output !== undefined) {
                console.log('hiiii',JSON.stringify(output));
                this.category = output[0].categories.id;
                console.log('this.category',this.category);
            }
            else {
                console.log("No info returned in call back in selectCategory method");
            }
        })
        .catch(error => {
            this.message = undefined;
            this.error = error;
            console.log("error", JSON.stringify(this.error));
        });
        searchRestaurants({ 'entityId' : this.entityId, 'entityType' : this.entityType, 'searchTerm' : this.restaurant, 'category' : this.category})
        .then(result => {
            this.message = JSON.parse(result);
            this.error = undefined
            console.log("Restaurant List::::", this.message);

            if(this.message !== undefined) {
                console.log("searchRestaurants pubSub fires....");
                fireEvent(this.pageRef, 'restaurantListUpdate', this.message);
            }
            else {
                console.log("No info returned in call back in searchRestaurant method");
            }
        })
        .catch(error => {
            this.message = undefined;
            this.error = error;
            console.log("error", JSON.stringify(this.error));
        });

    }
    searchRestaurant() {

        console.log('restaurant selection data',this.restaurant+''+this.entityId+''+this.entityType+''+ this.category);

        searchRestaurants({ 'entityId' : this.entityId, 'entityType' : this.entityType, 'searchTerm' : this.restaurant, 'category' : this.category})
        .then(result => {
            this.message = JSON.parse(result);
            this.error = undefined
            console.log("Restaurant List::::", this.message);

            if(this.message !== undefined) {
                console.log("searchRestaurants pubSub fires....");
                fireEvent(this.pageRef, 'restaurantListUpdate', this.message);
            }
            else {
                console.log("No info returned in call back in searchRestaurant method");
            }
        })
        .catch(error => {
            this.message = undefined;
            this.error = error;
            console.log("error", JSON.stringify(this.error));
        });
    } 

}