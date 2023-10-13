echo starting verify contact network $1.

truffle run verify OLEV1Lock  --network  $1

truffle run verify OLEV2Swap  --network  $1

echo finished verify contact network $1.


