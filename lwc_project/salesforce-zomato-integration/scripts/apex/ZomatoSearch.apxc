public class ZomatoSearch {

    public Integer results_found;
    public Integer results_start;
    public Integer results_shown;
    public List<Restaurants> restaurants;
    
 public class Restaurant {
  public R R;
  public String apikey;
  public String id;
  public String name;
  public String url;
  public Location location;
  public Integer switch_to_order_menu;
  public String cuisines;
  public Integer average_cost_for_two;
  public Integer price_range;
  public String my;
  public List<String> offers;
  public Integer opentable_support;
  public Integer is_zomato_book_res;
  public String mezzo_provider;
  public Integer is_book_form_web_view;
  public String book_form_web_view_url;
  public String book_again_url;
  public String thumb;
  public User_rating user_rating;
  public String photos_url;
  public String menu_url;
  public String featured_image;
  public Integer has_online_delivery;
  public Integer is_delivering_now;
  public Integer has_fake_reviews;
  public Boolean include_bogo_offers;
  public String deeplink;
  public Integer is_table_reservation_supported;
  public Integer has_table_booking;
  public String events_url;
  public List<String> establishment_types;
 }

 public class R {
  public Integer res_id;
 }

 public class User_rating {
  public String aggregate_rating;
  public String rating_text;
  public String rating_color;
  public String votes;
  public Integer has_fake_reviews;
 }

 public class Offers {
 }

 public class Restaurants {
  public Restaurant restaurant;
 }

 public class Location {
  public String address;
  public String locality;
  public String city;
  public Integer city_id;
  public String latitude;
  public String longitude;
  public String zipcode;
  public Integer country_id;
  public String locality_verbose;
 }

 
 public static ZomatoSearch parse(String json) {
  return (ZomatoSearch) System.JSON.deserialize(json, ZomatoSearch.class);
 }
}
