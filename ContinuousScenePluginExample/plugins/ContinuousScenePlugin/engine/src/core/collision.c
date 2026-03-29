#pragma bank 255

#include "collision.h"
#include "continuous_scene.h"
#include "scroll.h"
#include "vm.h"

UBYTE tile_hit_x = 0;
UBYTE tile_hit_y = 0;

UBYTE tile_col_test_range_y_impl(UBYTE tile_mask, UBYTE tx, UBYTE ty_start, UBYTE ty_end, unsigned char* col_ptr, UBYTE col_bank, UBYTE tile_width, UBYTE tile_height) NONBANKED {
    
    tile_hit_x = tx;
    tile_hit_y = ty_start;

    if (tile_hit_x >= tile_width || tile_hit_y >= tile_height) {
      return (COLLISION_ALL & tile_mask) ? COLLISION_ALL : 0;
    }

    UBYTE _save = CURRENT_BANK;
    UBYTE inc = UBYTE_LESS_THAN(ty_start, ty_end);
    SWITCH_ROM(col_bank);
    UBYTE* tile_ptr = col_ptr + (ty_start * (UINT16)tile_width) + tx;
    while (TRUE) {
        UBYTE tile = *tile_ptr;
        if (tile & tile_mask) {
            SWITCH_ROM(_save);
            return tile;
        }
        if (tile_hit_y == ty_end) {
            break;
        }
        if (inc) {
            tile_hit_y++;
            tile_ptr += tile_width;
        } else {
            tile_hit_y--;
            tile_ptr -= tile_width;
        }
        if (tile_hit_y >= tile_height) {
          SWITCH_ROM(_save);
          return (COLLISION_ALL & tile_mask) ? COLLISION_ALL : 0;
        }
    }
    SWITCH_ROM(_save);
    return 0;
}

UBYTE tile_col_test_range_x_impl(UBYTE tile_mask, UBYTE ty, UBYTE tx_start, UBYTE tx_end, unsigned char* col_ptr, UBYTE col_bank, UBYTE tile_width, UBYTE tile_height) NONBANKED {
    
    tile_hit_x = tx_start;
    tile_hit_y = ty;

    if (tile_hit_x >= tile_width || tile_hit_y >= tile_height) {
      return (COLLISION_ALL & tile_mask) ? COLLISION_ALL : 0;
    }

    UBYTE _save = CURRENT_BANK;
    UBYTE inc = UBYTE_LESS_THAN(tx_start, tx_end);
    SWITCH_ROM(col_bank);
    UBYTE* tile_ptr = col_ptr + (ty * (UINT16)tile_width) + tx_start;
    while (TRUE) {
        UBYTE tile = *tile_ptr;
        if (tile & tile_mask) {
            SWITCH_ROM(_save);
            return tile;
        }
        if (tile_hit_x == tx_end) {
            break;
        }
        if (inc) {
            tile_hit_x++;
            tile_ptr++;
        } else {
            tile_hit_x--;
            tile_ptr--;
        }
        if (tile_hit_x >= tile_width) {
          SWITCH_ROM(_save);
          return (COLLISION_ALL & tile_mask) ? COLLISION_ALL : 0;
        }                
    }
    SWITCH_ROM(_save);
    return 0;
}

UBYTE tile_col_test_range_y(UBYTE tile_mask, UBYTE tx, UBYTE ty_start, UBYTE ty_end) BANKED {
    //clamp collision check to within bounds of tilemap
    continuous_scene_t* continuous_scene;
    if ((continuous_scene_enabled & DIRECTION_TOP_FLAG) && (ty_start > SCREEN_OOB_TOP)){
        ty_start = 0;
    } else if ((continuous_scene_enabled & DIRECTION_BOTTOM_FLAG) && (ty_start >= image_tile_height) && (ty_start <= SCREEN_OOB_TOP)) {
        ty_start = image_tile_height - 1;
    }
    if ((continuous_scene_enabled & DIRECTION_TOP_FLAG) && (ty_end > SCREEN_OOB_TOP)){
        ty_end = 0;
    } else if ((continuous_scene_enabled & DIRECTION_BOTTOM_FLAG) && (ty_end >= image_tile_height) && (ty_end <= SCREEN_OOB_TOP)) {
        ty_end = image_tile_height - 1;
    }
    if ((continuous_scene_enabled & DIRECTION_LEFT_FLAG) && (tx > SCREEN_OOB_LEFT)){
        continuous_scene = &continuous_scenes[DIRECTION_LEFT];
        tx = tx + continuous_scene->tile_width;        
        return tile_col_test_range_y_impl(tile_mask, tx, ty_start, ty_end, continuous_scene->collision.ptr, continuous_scene->collision.bank, 
            continuous_scene->tile_width, continuous_scene->tile_height);
    } else if ((continuous_scene_enabled & DIRECTION_RIGHT_FLAG) && (tx >= image_tile_width) && (tx <= SCREEN_OOB_LEFT)) {
        tx = tx - image_tile_width;
        continuous_scene = &continuous_scenes[DIRECTION_RIGHT];
        return tile_col_test_range_y_impl(tile_mask, tx, ty_start, ty_end, continuous_scene->collision.ptr, continuous_scene->collision.bank, 
            continuous_scene->tile_width, continuous_scene->tile_height);
    }    
    return tile_col_test_range_y_impl(tile_mask, tx, ty_start, ty_end, collision_ptr, collision_bank, image_tile_width, image_tile_height);
}

UBYTE tile_col_test_range_x(UBYTE tile_mask, UBYTE ty, UBYTE tx_start, UBYTE tx_end) BANKED {
    //clamp collision check to within bounds of tilemap
     continuous_scene_t* continuous_scene;
    if ((continuous_scene_enabled & DIRECTION_LEFT_FLAG) && (tx_start > SCREEN_OOB_LEFT)){
        tx_start = 0;
    } else if ((continuous_scene_enabled & DIRECTION_RIGHT_FLAG) && (tx_start >= image_tile_width) && (tx_start <= SCREEN_OOB_LEFT)) {
        tx_start = image_tile_width - 1;
    }
    if ((continuous_scene_enabled & DIRECTION_LEFT_FLAG) && (tx_end > SCREEN_OOB_LEFT)){
        tx_end = 0;
    } else if ((continuous_scene_enabled & DIRECTION_RIGHT_FLAG) && (tx_end >= image_tile_width) && (tx_end <= SCREEN_OOB_LEFT)) {
        tx_end = image_tile_width - 1;
    }
    if ((continuous_scene_enabled & DIRECTION_TOP_FLAG) && (ty > SCREEN_OOB_TOP)){
        continuous_scene = &continuous_scenes[DIRECTION_TOP];
        ty = ty + continuous_scene->tile_height;              
        return tile_col_test_range_x_impl(tile_mask, ty, tx_start, tx_end, continuous_scene->collision.ptr, continuous_scene->collision.bank, 
            continuous_scene->tile_width, continuous_scene->tile_height);
    } else if ((continuous_scene_enabled & DIRECTION_BOTTOM_FLAG) && (ty >= image_tile_height) && (ty <= SCREEN_OOB_TOP)) {
        ty = ty - image_tile_height;
        continuous_scene = &continuous_scenes[DIRECTION_BOTTOM];
        return tile_col_test_range_x_impl(tile_mask, ty, tx_start, tx_end, continuous_scene->collision.ptr, continuous_scene->collision.bank, 
            continuous_scene->tile_width, continuous_scene->tile_height);
    }  
    return tile_col_test_range_x_impl(tile_mask, ty, tx_start, tx_end, collision_ptr, collision_bank, image_tile_width, image_tile_height);
}
