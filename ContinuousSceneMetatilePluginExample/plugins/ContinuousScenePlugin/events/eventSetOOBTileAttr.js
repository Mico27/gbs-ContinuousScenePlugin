export const id = "EVENT_SET_OOB_TILE_ATTR";
export const name = "Set out of bound tile attribute";
export const groups = ["EVENT_GROUP_SCENE"];

export const autoLabel = (fetchArg) => {
  return `Set out of bound tile attribute`;
};

export const fields = [
  {
    key: `tile_id_attr`,
    label: "Tile Attribute",
    type: "value",
    defaultValue: {
      type: "number",
      value: 0,
    },
  },
];

export const compile = (input, helpers) => {
  const { _setMemToScriptValue } = helpers;
  _setMemToScriptValue("fill_tile_attr", "UBYTE", input.tile_id_attr);
};
