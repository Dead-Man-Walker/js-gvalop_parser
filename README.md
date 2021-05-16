# python-gvalop_parser
**gvalop_parser.py** parses a string of **g**rouped **val**ues and **op**erators into
a group tree of values, operators, and subgroups, which can then be evaluated.

A group is represented by a grouping object, identified by a start and an end string,
and stores its child objects in a list.
An operators is identified by a representation string and an operator function.
The parser is initialized with a list of operators and a list of groupings.

Starting with a root group, the parser parses a string from left to right, building up a tree of groups,
operators and values, with the last two constituting tree leaves. The parsing returns the populated
root group.
Evaluating a group, usually the root group, with an optional evaluation
function for each value, collapses the tree into a single result by consuming each contained item
recursively into a result object.

The consumption of any item turn itself into and replaces itself with a result object:
A group consumes itself by consuming each contained item recursively.
An operator consumes itself by consuming its involved operand(s) and applying the operator function on
the result operand(s).
A value consumes itself by applying its evaluation function on itself.
A result is already consumed and thus does not change.

In order to be able reevaluate a group tree more than once (for different evaluation functions),
since consumption collapses the tree, the evaluation of a group happens on a copy of that group.


Example:
```python
    # A list of songs we want to filter by artists through a parsed string
    songs_list = [
        "Bob Marley - Jammin",
        "Stephen Marley - Break Us Apart",
        "Stephen & Damian Marley - Medication",
        "Ziggy Marley - Dragonfly",
        "Duane Stephenson - Exhale",
        "Tanya Stephens - It's a Pity"
    ]

    # The string to be parsed. Here we want to filter for songs that must contain a
    # 'marley' in any case, while also containing a 'stephen' with neither
    # a 'ziggy' nor a 'damian', or a 'bob'
    artists_filter = "marley && (stephen && !(ziggy || damian) || bob)"

    # Creating a set of operators. Here we use the three logical operators AND, OR, and NOT
    import operator

    opAnd = OperatorBinary(representation="&&", func=operator.and_)
    opOr = OperatorBinary(representation="||", func=operator.or_)
    opNot = OperatorUnary(representation="!", func=operator.not_)

    # Creating a grouping
    grouping = Grouping("(", ")")

    # Creating the parser with the just created operators and grouping
    parser = Parser(operators=[opAnd, opOr, opNot], groupings=[grouping])

    # Parse the filter string and fetch the returned root group
    root = parser.parse(artists_filter)

    # Setup a filter function that (re)evaluates the parsed root
    # for each song
    def songInFilterValue(song):
        result = root.evaluate(
            lambda parser_value: parser_value in song.lower()
        )
        return result.value

    # Filter the songs list
    filtered_list = [
        song for song in songs_list if songInFilterValue(song)

    ]

    print(filtered_list)
    # >>> ['Bob Marley - Jammin', 'Stephen Marley - Break Us Apart']
```
