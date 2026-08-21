# Pairwise relationship search rides on the `taxon` param

The portal exists to answer pairwise Relationship questions — "which X are hosts of
Y". A search matches one Specimen, so the Related taxon cannot be an ordinary second
taxon row: no Specimen is both a rodent and a tick, and two rows AND'd together would
match nothing. Related taxa are therefore carried in the same `taxon` param, which
gains a rank and a name per Related taxon after the relations segment:
`rank|name|relations|related rank|related name|related rank|related name`. A row may
carry any number of them, and they are OR'd — "Sorex that is the host of any of these
three parasites". The number of segments identifies the shape, so the existing two-
and three-segment forms keep working untouched.

## Considered options

A separate `rel=` param was the alternative, and was rejected. `taxon` already decodes
three shapes, and a fourth was judged no worse than a second param whose relationship
to the first would itself need explaining.

## Consequences

Search URLs are public. Users paste them into papers, so the format cannot be changed
freely once released.

Because the segment count carries the meaning, a `|` typed by a user is escaped as
`\|`. Doubling it instead is ambiguous, since a delimiter followed by an escaped pipe
cannot be told apart from an escaped pipe followed by a delimiter. Relations join with
`;` rather than `|` so that they stay within a single segment.

All other filters constrain the searched Specimen and never the Related taxon. A
parasite was collected during its host's collecting event, whatever place its
determination was later made in. Filtering on the Related taxon's own Attributes is
out of scope.
