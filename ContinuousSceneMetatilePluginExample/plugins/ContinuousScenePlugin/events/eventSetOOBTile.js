export const id = "EVENT_SET_OOB_TILE";
export const name = "Set out of bound tile";
export const groups = ["EVENT_GROUP_SCENE"];

export const autoLabel = (fetchArg) => {
  return `Set out of bound tile`;
};

export const fields = [
  {
    key: `tile_id`,
    label: "Tile Id",
    type: "value",
    defaultValue: {
      type: "number",
      value: 0,
    },
  },
];

export const compile = (input, helpers) => {
  const { _setMemToScriptValue } = helpers;
  _setMemToScriptValue("fill_tile_id", "UBYTE", input.tile_id);
};
