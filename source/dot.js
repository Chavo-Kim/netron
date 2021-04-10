/* jshint esversion: 6 */

var dot = dot || {};
var base = base || require('./base');

dot.ModelFactory = class {

    match(context) {
        const identifier = context.identifier;
        const extension = identifier.split('.').pop().toLowerCase();
        // Todo: match 제대로 구현
        return true;

        switch (extension) {
            default:
                try {
                    const reader = base.TextReader.create(context.stream.peek(), 65536);
                    for (;;) {
                        const line = reader.read();
                        if (line === undefined) {
                            break;
                        }
                        const text = line.trim();
                        const textArray = text.split(' ');
                        if ((textArray[0] === 'digraph' || textArray[0] === 'graph') && text.endsWith('{')) {
                            return true;
                        }
                        return false;
                    }
                }
                catch (err) {
                    // continue regardless of error
                }
                break;
        }
        return false;
    }

    open(context) {
        return dot.Metadata.open(context).then((metadata) => {
            const open = (metadata, cfg) => {
                return new dot.Model(metadata, cfg);
            };

            return open(metadata, context.stream.peek());
        });
    }
};

dot.Model = class {
    constructor(metadata, cfg) {
        this._graphs = [ new dot.Graph() ];
    }

    get format() {
        return 'Dot';
    }

    get graphs() {
        return this._graphs;
    }
};

dot.Graph = class {

    constructor() {
        this._inputs = [];
        this._outputs = [];
        this._nodes = [];

        // read_cfg
        // const sections = [];
        // let section = null;
        // // const reader = base.TextReader.create(cfg);
        // // let lineNumber = 0;
        // // for (;;) {
        // //     lineNumber++;
        // //     const text = reader.read();
        // //     if (text === undefined) {
        // //         break;
        // //     }
        // //     const line = text.replace(/\s/g, '');
        // //
        // //     if(line.length > 0) {
        // //     }
        // // }

        // this._inputs.push(new dot.Parameter('a', true, []));
        // this._nodes.push(new dot.Node(null, null, {name: 'b', type: 'nothing'}));
    }

    get name() {
        return this._name;
    }

    get groups() {
        //Todo: return true
        return false;
    }

    get inputs() {
        return this._inputs;
    }

    get outputs() {
        return this._outputs;
    }

    get nodes() {
        return this._nodes;
    }
};

dot.Parameter = class {
    constructor(name, visible, args) {
        this._name = name;
        this._visible = visible;
        this._arguments = args;
    }

    get name() {
        return this._name;
    }

    get visible() {
        return this._visible;
    }

    get arguments() {
        return this._arguments;
    }
};

dot.Argument = class {

    constructor(name, type, initializer) {
        if (typeof name !== 'string') {
            throw new dot.Error("Invalid argument identifier '" + JSON.stringify(name) + "'.");
        }
        this._name = name;
        this._type = type || null;
        this._initializer = initializer || null;
    }

    get name() {
        return this._name;
    }

    get type() {
        if (this._initializer) {
            return this._initializer.type;
        }
        return this._type;
    }

    get initializer() {
        return this._initializer;
    }
};

dot.Node = class {

    constructor(metadata, net, section) {
        this._name = section.name || '';
        this._location = section.line !== undefined ? section.line.toString() : undefined;
        this._metadata = metadata;
        this._type = section.type;
        this._attributes = [];
        this._inputs = [];
        this._outputs = [];
        this._chain = [];
        const layer = section.layer;
        if (layer && layer.inputs && layer.inputs.length > 0) {
            this._inputs.push(new dot.Parameter(layer.inputs.length <= 1 ? 'input' : 'inputs', true, layer.inputs));
        }
        if (layer && layer.weights && layer.weights.length > 0) {
            this._inputs = this._inputs.concat(layer.weights);
        }
        if (layer && layer.outputs && layer.outputs.length > 0) {
            this._outputs.push(new dot.Parameter(layer.outputs.length <= 1 ? 'output' : 'outputs', true, layer.outputs));
        }
        if (section.chain) {
            for (const chain of section.chain) {
                this._chain.push(new dot.Node(metadata, net, chain, ''));
            }
        }
        const options = section.options;
        if (options) {
            for (const key of Object.keys(options)) {
                this._attributes.push(new dot.Attribute(metadata.attribute(this._type, key), key, options[key]));
            }
        }
    }

    get name() {
        return this._name;
    }

    get location() {
        return this._location;
    }

    get type() {
        return this._type;
    }

    get metadata() {
        return this._metadata.type(this._type);
    }

    get attributes() {
        return this._attributes;
    }

    get inputs() {
        return this._inputs;
    }

    get outputs() {
        return this._outputs;
    }

    get chain() {
        return this._chain;
    }
};

dot.Attribute = class {

    constructor(schema, name, value) {
        this._name = name;
        this._value = value;
        if (schema) {
            this._type = schema.type || '';
            switch (this._type) {
                case 'int32': {
                    const number = parseInt(this._value, 10);
                    if (Number.isInteger(number)) {
                        this._value = number;
                    }
                    break;
                }
                case 'float32': {
                    const number = parseFloat(this._value);
                    if (!isNaN(number)) {
                        this._value = number;
                    }
                    break;
                }
                case 'int32[]': {
                    const numbers = this._value.split(',').map((item) => parseInt(item.trim(), 10));
                    if (numbers.every((number) => Number.isInteger(number))) {
                        this._value = numbers;
                    }
                    break;
                }
            }
            if (Object.prototype.hasOwnProperty.call(schema, 'visible') && !schema.visible) {
                this._visible = false;
            }
            else if (Object.prototype.hasOwnProperty.call(schema, 'default')) {
                if (this._value == schema.default) {
                    this._visible = false;
                }
            }
        }
    }

    get name() {
        return this._name;
    }

    get type() {
        return this._type;
    }

    get value() {
        return this._value;
    }

    get visible() {
        return this._visible == false ? false : true;
    }
};

dot.Metadata = class {

    static open(context) {
        if (dot.Metadata._metadata) {
            return Promise.resolve(dot.Metadata._metadata);
        }
        return context.request('darknet-metadata.json', 'utf-8', null).then((data) => {
            dot.Metadata._metadata = new dot.Metadata(data);
            return dot.Metadata._metadata;
        }).catch(() => {
            dot.Metadata._metadata = new dot.Metadata(null);
            return dot.Metadata._metadata;
        });
    }

    constructor(data) {
        this._map = new Map();
        this._attributeMap = new Map();
        if (data) {
            const items = JSON.parse(data);
            if (items) {
                for (const item of items) {
                    if (item && item.name && item.schema) {
                        if (this._map.has(item.name)) {
                            throw new dot.Error("Duplicate metadata key '" + item.name + "'.");
                        }
                        item.schema.name = item.name;
                        this._map.set(item.name, item.schema);
                    }
                }
            }
        }
    }

    type(name) {
        return this._map.get(name) || null;
    }

    attribute(type, name) {
        const key = type + ':' + name;
        if (!this._attributeMap.has(key)) {
            this._attributeMap.set(key, null);
            const schema = this.type(type);
            if (schema && schema.attributes) {
                for (const attribute of schema.attributes) {
                    this._attributeMap.set(type + ':' + attribute.name, attribute);
                }
            }
        }
        return this._attributeMap.get(key);
    }
};

dot.Error = class extends Error {

    constructor(message) {
        super(message);
        this.name = 'Error loading Dot model.';
    }
};

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
    module.exports.ModelFactory = dot.ModelFactory;
}

