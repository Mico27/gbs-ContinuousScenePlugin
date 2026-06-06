#pragma bank 255

#include "collision.h"
#include "bankdata.h"
#include "continuous_scene.h"
#include "meta_tiles.h"
#include "math.h"
#include "scroll.h"
#include "data/states_defines.h"
#include "vm.h"

UBYTE tile_hit_x = 0;
UBYTE tile_hit_y = 0;

// Reads the metatile ID for tile (tx, ty) from a neighbor scene's tilemap in ROM,
// then returns the collision byte from the shared sram_collision_data table.
static UBYTE get_neighbor_metatile_collision(continuous_scene_t* cs, UBYTE tx, UBYTE ty) {
    if (!cs->tilemap.ptr || !cs->tilemap.bank) return COLLISION_ALL;
    if (tx >= cs->tile_width || ty >= cs->tile_height) return COLLISION_ALL;
#if METATILE_SIZE == METATILE_SIZE_16    
    UBYTE metatile_id = ReadBankedUBYTE((const UBYTE*)cs->tilemap.ptr + ((UWORD)(ty >> 1) * (cs->tile_width >> 1) + (tx >> 1)), cs->tilemap.bank);
    return sram_collision_data[TILE_MAP_OFFSET(metatile_id, tx, ty)];
#else
    UBYTE metatile_id = ReadBankedUBYTE((const UBYTE*)cs->tilemap.ptr + ((UWORD)ty * cs->tile_width + tx), cs->tilemap.bank);
    return sram_collision_data[metatile_id];
#endif
}

UBYTE legacy_tile_col_test_range_y(UBYTE tile_mask, UBYTE tx, UBYTE ty_start, UBYTE ty_end) NONBANKED {
    UBYTE _save = CURRENT_BANK;
    UBYTE inc = UBYTE_LESS_THAN(ty_start, ty_end);
    SWITCH_ROM(collision_bank);
    UBYTE* tile_ptr = collision_ptr + (ty_start * (UINT16)image_tile_width) + tx;
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
            tile_ptr += image_tile_width;
        } else {
            tile_hit_y--;
            tile_ptr -= image_tile_width;
        }
        if (tile_hit_y >= image_tile_height) {
          SWITCH_ROM(_save);
          return COLLISION_ALL & tile_mask ? COLLISION_ALL : 0;
        }
    }
    SWITCH_ROM(_save);
    return 0;
}

UBYTE tile_col_test_range_y(UBYTE tile_mask, UBYTE tx, UBYTE ty_start, UBYTE ty_end) BANKED {
    tile_hit_x = tx;
    tile_hit_y = ty_start;

    if (tile_hit_x >= image_tile_width || tile_hit_y >= image_tile_height) {
        if (continuous_scene_enabled && metatile_collision_bank) {
            continuous_scene_t* cs = NULL;
            UBYTE neighbor_tx = tile_hit_x;
            BYTE y_offset = 0;
            if (tile_hit_x > SCREEN_OOB_LEFT && (continuous_scene_enabled & DIRECTION_LEFT_FLAG)) {
                cs = &continuous_scenes[DIRECTION_LEFT];
                neighbor_tx = tile_hit_x + cs->tile_width;
                y_offset = cs->offset;
            } else if (tile_hit_x >= image_tile_width && (continuous_scene_enabled & DIRECTION_RIGHT_FLAG)) {
                cs = &continuous_scenes[DIRECTION_RIGHT];
                neighbor_tx = tile_hit_x - image_tile_width;
                y_offset = cs->offset;
            }
            if (cs) {
                UBYTE inc = UBYTE_LESS_THAN(ty_start, ty_end);
                UBYTE tile;
                while (TRUE) {
                    UBYTE neighbor_ty = tile_hit_y + y_offset;
                    tile = get_neighbor_metatile_collision(cs, neighbor_tx, neighbor_ty);
                    if (tile & tile_mask) return tile;
                    if (tile_hit_y == ty_end) break;
                    if (inc) tile_hit_y++;
                    else tile_hit_y--;
                }
                return 0;
            }
        } else if (continuous_scene_enabled) {
            if (tile_hit_x > SCREEN_OOB_LEFT && (continuous_scene_enabled & DIRECTION_LEFT_FLAG)) return 0;
            if (tile_hit_x >= image_tile_width && (continuous_scene_enabled & DIRECTION_RIGHT_FLAG)) return 0;
            if (tile_hit_y > SCREEN_OOB_TOP && (continuous_scene_enabled & DIRECTION_TOP_FLAG)) return 0;
            if (tile_hit_y >= image_tile_height && (continuous_scene_enabled & DIRECTION_BOTTOM_FLAG)) return 0;
        }
        return COLLISION_ALL & tile_mask ? COLLISION_ALL : 0;
    }
    if (metatile_collision_bank) {
#if METATILE_SIZE == METATILE_SIZE_16
        UBYTE metatile_x_offset = METATILE_X_OFFSET(tx);
        UBYTE tile_x_offset = TILE_X_OFFSET(tx);
#endif
        UBYTE inc = UBYTE_LESS_THAN(ty_start, ty_end);
        UBYTE tile;
        while (TRUE) {
#if METATILE_SIZE == METATILE_SIZE_16
            tile = sram_collision_data[get_metatile_tile(metatile_x_offset + METATILE_Y_OFFSET(tile_hit_y), tile_x_offset + TILE_Y_OFFSET(tile_hit_y))];
#else
            tile = sram_collision_data[sram_map_data[METATILE_MAP_OFFSET(tx, tile_hit_y)]];
#endif
            if (tile & tile_mask) {
                return tile;
            }
            if (tile_hit_y == ty_end) {
                break;
            }
            if (inc) {
                tile_hit_y++;
            } else {
                tile_hit_y--;
            }
            if (tile_hit_y >= image_tile_height) {
                if (continuous_scene_enabled & DIRECTION_BOTTOM_FLAG) return 0;
                return COLLISION_ALL & tile_mask ? COLLISION_ALL : 0;
            }
        }
        return 0;
    }
    return legacy_tile_col_test_range_y(tile_mask, tx, ty_start, ty_end);
}

UBYTE legacy_tile_col_test_range_x(UBYTE tile_mask, UBYTE ty, UBYTE tx_start, UBYTE tx_end) NONBANKED {
    UBYTE _save = CURRENT_BANK;
    UBYTE inc = UBYTE_LESS_THAN(tx_start, tx_end);
    SWITCH_ROM(collision_bank);
    UBYTE* tile_ptr = collision_ptr + (ty * (UINT16)image_tile_width) + tx_start;
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
        if (tile_hit_x >= image_tile_width) {
          SWITCH_ROM(_save);
          return COLLISION_ALL & tile_mask ? COLLISION_ALL : 0;
        }
    }
    SWITCH_ROM(_save);
    return 0;
}

UBYTE tile_col_test_range_x(UBYTE tile_mask, UBYTE ty, UBYTE tx_start, UBYTE tx_end) BANKED {
    tile_hit_x = tx_start;
    tile_hit_y = ty;
    if (tile_hit_x >= image_tile_width || tile_hit_y >= image_tile_height) {
        if (continuous_scene_enabled && metatile_collision_bank) {
            continuous_scene_t* cs = NULL;
            UBYTE neighbor_ty = tile_hit_y;
            BYTE x_offset = 0;
            if (tile_hit_y > SCREEN_OOB_TOP && (continuous_scene_enabled & DIRECTION_TOP_FLAG)) {
                cs = &continuous_scenes[DIRECTION_TOP];
                neighbor_ty = tile_hit_y + cs->tile_height;
                x_offset = cs->offset;
            } else if (tile_hit_y >= image_tile_height && (continuous_scene_enabled & DIRECTION_BOTTOM_FLAG)) {
                cs = &continuous_scenes[DIRECTION_BOTTOM];
                neighbor_ty = tile_hit_y - image_tile_height;
                x_offset = cs->offset;
            }
            if (cs) {
                UBYTE inc = UBYTE_LESS_THAN(tx_start, tx_end);
                UBYTE tile;
                while (TRUE) {
                    UBYTE neighbor_tx = tile_hit_x + x_offset;
                    tile = get_neighbor_metatile_collision(cs, neighbor_tx, neighbor_ty);
                    if (tile & tile_mask) return tile;
                    if (tile_hit_x == tx_end) break;
                    if (inc) tile_hit_x++;
                    else tile_hit_x--;
                }
                return 0;
            }
        } else if (continuous_scene_enabled) {
            if (tile_hit_y > SCREEN_OOB_TOP && (continuous_scene_enabled & DIRECTION_TOP_FLAG)) return 0;
            if (tile_hit_y >= image_tile_height && (continuous_scene_enabled & DIRECTION_BOTTOM_FLAG)) return 0;
            if (tile_hit_x > SCREEN_OOB_LEFT && (continuous_scene_enabled & DIRECTION_LEFT_FLAG)) return 0;
            if (tile_hit_x >= image_tile_width && (continuous_scene_enabled & DIRECTION_RIGHT_FLAG)) return 0;
        }
        return COLLISION_ALL & tile_mask ? COLLISION_ALL : 0;
    }
    if (metatile_collision_bank) {
        UWORD metatile_y_offset = METATILE_Y_OFFSET(ty);
#if METATILE_SIZE == METATILE_SIZE_16
        UBYTE tile_y_offset = TILE_Y_OFFSET(ty);
#endif
        UBYTE inc = UBYTE_LESS_THAN(tx_start, tx_end);
        UBYTE tile;
        while (TRUE) {
#if METATILE_SIZE == METATILE_SIZE_16
            tile = sram_collision_data[get_metatile_tile(metatile_y_offset + METATILE_X_OFFSET(tile_hit_x), tile_y_offset + TILE_X_OFFSET(tile_hit_x))];
#else
            tile = sram_collision_data[sram_map_data[(metatile_y_offset + tile_hit_x)]];
#endif
            if (tile & tile_mask) {
                return tile;
            }
            if (tile_hit_x == tx_end) {
                break;
            }
            if (inc) {
                tile_hit_x++;
            } else {
                tile_hit_x--;
            }
            if (tile_hit_x >= image_tile_width) {
                if (continuous_scene_enabled & DIRECTION_RIGHT_FLAG) return 0;
                return COLLISION_ALL & tile_mask ? COLLISION_ALL : 0;
            }
        }
        return 0;
    }
    return legacy_tile_col_test_range_x(tile_mask, ty, tx_start, tx_end);
}
